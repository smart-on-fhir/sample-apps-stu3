#!/usr/bin/env node

require("colors");

const request   = require("request");
const jwt       = require("jsonwebtoken");
const crypto    = require("crypto");
const fs        = require("fs");
const base64url = require("base64-url");
const lib       = require("./lib");
const config    = lib.requireIfExists("./config.json") || {};
const pkg       = require("./package.json");
const APP = require('commander');

// The (last known) access token is stored in this global variable. When it
// expires the code should re-authenticate and update it.
let ACCESS_TOKEN;

APP
    .version(pkg.version)
    .option('-f, --fhir-url [url]' , 'FHIR server URL', config.fhir_url || "https://bulk-data.smarthealthit.org/eyJlcnIiOiIiLCJwYWdlIjoxMDAsImR1ciI6MTAsInRsdCI6MTUsIm0iOjF9/fhir")
    .option('-T, --type [list]'    , 'Zero or more resource types to download. If omitted downloads everything')
    .option('-s, --start [date]'   , 'Only include resources modified after this date')
    .option('-g, --group [id]'     , 'Group ID - only include resources that belong to this group')
    .option('-d, --dir [directory]', `Download destination`, `${__dirname}/downloads`)
    .option('-p, --proxy [url]'    , 'Proxy server if needed')
    .parse(process.argv);


function downloadFhir() {
    
    if (!ACCESS_TOKEN && config.private_key) {
        return authorize().then(downloadFhir);
    }

    let headers = {
        Accept: "application/fhir+json",
        Prefer: "respond-async"
    };

    if (ACCESS_TOKEN) {
        headers.Authorization = "Bearer " + ACCESS_TOKEN;
    }

    let url = APP.fhirUrl, query = [];
    if (APP.group) {
        url += `/Group/${APP.group}/$export`
    } else {
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
    }) .then(
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
        console.error(`Download failed: ${err}`.red);
        process.exit(1);
    });
}

function waitForFiles(url, startTime, timeToWait = 0) {
    return lib.requestPromise({
        url,
        proxy: APP.proxy,
        json: true,
        headers : {
            Authorization: "Bearer " + ACCESS_TOKEN
        }
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
                headers: {
                    Accept: "application/fhir+ndjson",
                    Authorization: "Bearer " + ACCESS_TOKEN
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
            }).on('data', () => {
                file.chunks += 1;
                table.log();
            })
        })
            // lib.requestPromise({ url })
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
        iss: config.service_url,
        sub: config.client_id,
        aud: config.token_url,
        exp: Date.now()/1000 + 300, // 5 min
        jti: crypto.randomBytes(32).toString("hex")
    };

    return lib.requestPromise({
        method: "POST",
        url   : config.token_url,
        json  : true,
        proxy : APP.proxy,
        form  : {
            scope: "system/*.*",
            grant_type: "client_credentials",
            client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
            client_assertion: jwt.sign(
                jwtToken,
                base64url.decode(config.private_key),
                { algorithm: 'RS256'}
            )
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
    downloadFhir().catch(err => {
        
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
