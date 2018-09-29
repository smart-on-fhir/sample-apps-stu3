#!/usr/bin/env node

require("colors");

const request   = require("request");
const jwt       = require("jsonwebtoken");
const crypto    = require("crypto");
const fs        = require("fs");
const base64url = require("base64-url");
const express   = require("express");
const Url       = require("url");
const lib       = require("./lib");
const jwk       = require("jwk-lite");
const APP       = require("commander");
const jwkToPem  = require("jwk-to-pem");
const config    = lib.requireIfExists("./config.json") || {};
const pkg       = require("./package.json");

// The (last known) access token is stored in this global variable. When it
// expires the code should re-authenticate and update it.
let ACCESS_TOKEN;
let SERVER;

APP
    .version(pkg.version)
    .option('-f, --fhir-url [url]' , 'FHIR server URL', config.fhir_url || "https://bulk-data.smarthealthit.org/eyJlcnIiOiIiLCJwYWdlIjoxMDAsImR1ciI6MTAsInRsdCI6MTUsIm0iOjF9/fhir")
    .option('-T, --type [list]'    , 'Zero or more resource types to download. If omitted downloads everything')
    .option('-s, --start [date]'   , 'Only include resources modified after this date')
    .option('-g, --group [id]'     , 'Group ID - only include resources that belong to this group. Ignored if --global is set')
    .option('-d, --dir [directory]', `Download destination`, `${__dirname}/downloads`)
    .option('-p, --proxy [url]'    , 'Proxy server if needed')
    .option('--global'             , 'Global (system-level) export')
    .option('--no-gzip'            , 'Do not request GZipped files')
    .parse(process.argv);

if (config.client_id) {

    if (!config.jwks || typeof config.jwks != "object") {
        console.error('No "jwks" object found in config'.red);
        process.exit(1);
    }

    if (!Array.isArray(config.jwks.keys)) {
        console.error('"config.jwks.keys" must be an array of keys'.red);
        process.exit(1);
    }

    if (!config.jwks.keys.length) {
        console.error('"config.jwks.keys" must be an array of keys and cannot be empty'.red);
        process.exit(1);
    }

    // Start a small server to host our JWKS at http://localhost:7000/jwks.json
    // WARNING! This URL should match a value that the backend service supplied to
    // the EHR at client registration time.
    let url = Url.parse(config.jwks_url);
    let isLocal = url.hostname === "localhost" && url.hostname === "0.0.0.0" && url.hostname === "127.0.0.1";

    if (config.jwks_url && isLocal) {

        // Parse config.jwks_url and make sure that it points to http://localhost:{some port}/{some path}
        if (url.protocol != "http:") {
            console.error(`Only http is supported for config.jwks_url`.red);
            process.exit(1);
        }
        if (!url.port) {
            console.error(`config.jwks_url must specify a port`.red);
            process.exit(1);
        }
        if (+url.port < 1024) {
            console.error(`config.jwks_url must use a port greater than 1024`.red);
            process.exit(1);
        }

        // Listen on the specified port and pathname
        const app = express();
        app.get(url.pathname, (req, res) => {

            // Only host the public keys!
            res.json({ keys: config.jwks.keys.filter(k => k.key_ops.indexOf("sign") == -1) });
        });
        SERVER = app.listen(+url.port, function() {
            console.log(`The JWKS is available at http://localhost:${url.port}${url.pathname}`);
        });
    }
}

function downloadFhir() {
    
    if (!ACCESS_TOKEN && config.jwks && config.client_id) {
        return authorize().then(downloadFhir);
    }

    let start = Date.now();

    let headers = {
        Accept: "application/fhir+json",
        Prefer: "respond-async"
    };

    if (ACCESS_TOKEN) {
        headers.Authorization = "Bearer " + ACCESS_TOKEN;
    }

    let url = APP.fhirUrl, query = [];

    if (APP.global) {
        url += `/$export`;
    }
    else if (APP.group) {
        url += `/Group/${APP.group}/$export`
    }
    else {
        url += `/Patient/$export`
    }

    if (APP.type) {
        query.push(`_type=${APP.type}`);
    }

    if (APP.start) {
        query.push(`_since=${APP.start}`);
    }

    if (query.length) {
        url += "?" + query.join("&");
    }

    // console.log(url)

    return lib.requestPromise({
        url,
        headers,
        proxy: APP.proxy
    })
    .then(
        res => {
            console.log("Waiting for the server to generate the files...".green);
            return waitForFiles(
                res.headers["content-location"],
                Date.now()
            );
        }
    )
    .then(files => {
        let table = lib.createTable(files);
        table.log();
        process.stdout.write("\r\033[?25l"); // hide cursor
        return table;
    })
    .then(downloadFile)
    .catch(err => {
        process.stdout.write("\r\033[?25h"); // show cursor
        console.error(`Download failed: ${err.stack}`.red);
        process.exit(1);
    })
    .then(() => {
        console.log(`Completed in ${lib.formatDuration(Date.now() - start)}`)
    });
}

function waitForFiles(url, startTime, timeToWait = 0) {
    return lib.requestPromise({
        url,
        proxy: APP.proxy,
        json: true,
        headers: ACCESS_TOKEN ? {
            Authorization: "Bearer " + ACCESS_TOKEN
        } : {}
    }, timeToWait).then(res => {

        // Still working?
        if (res.statusCode == 202) {
            let pct = res.headers["x-progress"];
            if (pct) {
                pct = parseInt(pct, 10)
                if (!isNaN(pct) && isFinite(pct) && pct >= 0) {
                    process.stdout.write(lib.generateProgress(pct));
                }
                else {
                    process.stdout.write(
                        "\r\033[2KWaited for " + lib.formatDuration(Date.now() - startTime)
                    );
                }
                return waitForFiles(url, startTime, 1000);
            }
        }

        // Files generated
        else if (res.statusCode == 200) {
            process.stdout.write(lib.generateProgress(100));
            console.log(``);

            // v2: Try obtaining the links from the body
            if (res.body && Array.isArray(res.body.output)) {
                return res.body.output.map(f => f.url);
            }

            // v1: Link header. A link can look like <meta.rdf>;rel=meta
            return String(res.headers.link || "").split(/\s*,\s*/)
                .map(f => f.replace(/^\s*<\s*/, "").replace(/\s*>.*$/, ""));
        }

        // Any other status is considered an error
        // This includes the "204 No Content" case!
        return Promise.reject(res.statusCode + ": " + res.statusMessage);
    });
}

function downloadFile(table) {
    let file = table.next();
    if (file) {
        return new Promise((resolve, reject) => {
            file.status = "Downloading";
            table.log();

            request({
                strictSSL: false,
                url: file.url,
                proxy: APP.proxy,
                gzip: !!APP.gzip,
                headers: {
                    Accept: "application/fhir+ndjson",
                    Authorization: ACCESS_TOKEN ? "Bearer " + ACCESS_TOKEN : undefined
                }
            }, function(error, res) {
                if (error) {
                    return reject(error);
                }
                if (res.statusCode >= 400) {
                    return reject(new Error(
                        `${res.statusCode}: ${res.statusMessage}\n${res.body}`
                    ));
                }
                resolve(res);
            }).on("data", chunk => {
                file.chunks += 1;
                file.bytes += chunk.length;
            }).on("response", response => {
                response.on("data", data => {
                    file.rawBytes += data.length;
                    table.log();
                });
            });
        })
        .then(res => {
            if (APP.dir && APP.dir != "/dev/null") {
                fs.writeFile(
                    `${APP.dir}/${file.name}`,
                    res.body,
                    error => {
                        if (error) {
                            throw error
                        }
                    }
                )
            }
        })
        .then(() => {
            file.status = "Done";
            table.log()
            return downloadFile(table)
        }, err => {
            file.status = "FAILED";
            table.log()
            process.stdout.write("\r\033[?25h"); // show cursor
            console.log(String(err).red);
        });
    }

    process.stdout.write("\r\033[?25h"); // show cursor
    console.log(`\nAll files downloaded`.green);
    return true;
}

/**
 * Authorizes the app and resolves the promise with the access token response
 * @returns {Promise<Object>}
 */
function authorize() {

    console.log(ACCESS_TOKEN === null ? "Re-authorizing..." : "Authorizing...");

    let jwtToken = {
        iss: config.client_id,
        sub: config.client_id,
        aud: config.token_url,
        exp: Date.now()/1000 + 300, // 5 min
        jti: crypto.randomBytes(32).toString("hex")
    };

    // Find the last private/public key pair from the JWKS keys
    let pair = lib.findKeyPair(config.jwks.keys);
    if (!pair) {
        return Promise.reject(
            new Error("Unable to find key pair in the JWKS configuration")
        );
    }
    
    // Detect the private key algorithm
    // TODO: Add better EC detection if needed
    let alg = pair.privateKey.alg || "ES384";

    // Save the key id for later
    let kid = pair.privateKey.kid;
    
    // Convert the private JWK to PEM private key ti sign with
    let privateKey = jwkToPem(pair.privateKey, { private: true });

    // Sign the jwt with our private key
    let signed = jwt.sign(jwtToken, privateKey, {
        algorithm: alg,
        keyid: kid,
        header: {
            jku: config.jwks_url || undefined
        }
    });
    
    // Authorize
    return lib.requestPromise({
        method: "POST",
        url   : config.token_url,
        json  : true,
        proxy : APP.proxy,
        form  : {
            scope: "system/*.*",
            grant_type: "client_credentials",
            client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
            client_assertion: signed
        }
    }).then(res => {
        ACCESS_TOKEN = res.body.access_token;
        return res.body;
    }).catch(err => {
        console.error(`Authorization failed: ${err}`.red);
        process.exit(1);
    });
}


// RUN! ------------------------------------------------------------------------
if (APP.fhirUrl) {
    downloadFhir()
    .then(() => {
        if (SERVER) SERVER.close();
    })
    .catch(err => {
        
        // Check if this is an expired token error
        if (String(err).search(/expired/i) > -1) {
            
            // If so, clear the local token to trigger re-authorization
            ACCESS_TOKEN = null;

            // and then try again
            return downloadFhir();
        }
        
        console.error(String(err).red);
    });
}
else {
    APP.help();
}
