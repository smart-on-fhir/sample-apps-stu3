#!/usr/bin/env node

require("colors");

const request      = require("request");
const jwt          = require("jsonwebtoken");
const crypto       = require("crypto");
const fs           = require("fs");
const express      = require("express");
const Url          = require("url");
const APP          = require("commander");
const jwkToPem     = require("jwk-to-pem");
const stream       = require("stream");
const moment       = require("moment");
const lib          = require("./lib");
const config       = lib.requireIfExists("./config.json") || {};
const pkg          = require("./package.json");
const NdJsonStream = require("./streams/NdJsonStream");
const DocumentReferenceHandler = require("./streams/DocumentReferenceHandler");

// The (last known) access token is stored in this global variable. When it
// expires the code should re-authenticate and update it.
let ACCESS_TOKEN;

// Small server to host the public keys in case you provide local jwks_url and
// jwks set
let SERVER;

// Collect error here. They cannot be logged properly while the task is running
// but after all download attempts are finished, we check this array and log it
// if it is not empty
let ERROR_LOG = [];

let STATUS_URL;

APP
    .version(pkg.version)
    .option('-f, --fhir-url [url]'  , 'FHIR server URL', config.fhir_url || "https://bulk-data.smarthealthit.org/eyJlcnIiOiIiLCJwYWdlIjoxMDAsImR1ciI6MTAsInRsdCI6MTUsIm0iOjF9/fhir")
    .option('-T, --type [list]'     , 'Zero or more resource types to download. If omitted downloads everything')
    .option('-e, --elements [list]' , 'Zero or more FHIR elements to include in the downloaded resources')
    .option('-p, --patient [list]'  , 'Zero or more patient IDs to be included. Implies --post')
    .option('-i, --includeAssociatedData [list]', 'String of comma delimited values. When provided, server with support for the parameter and requested values SHALL return a pre-defined set of metadata associated with the request.')
    .option('--start [date]'        , 'Only include resources modified after this date (alias of "--_since"')
    .option('-s, --_since [date]'   , 'Only include resources modified after this date')
    .option('-g, --group [id]'      , 'Group ID - only include resources that belong to this group. Ignored if --global is set')
    .option('--_typeFilter [string]', 'Experimental _typeFilter parameter passed as is to the server')
    .option('-d, --dir [directory]' , `Download destination`, `${__dirname}/downloads`)
    .option('-p, --proxy [url]'     , 'Proxy server if needed')
    .option("-c, --concurrency [n]" , "Number of parallel connections", 10)
    .option('--lenient'             , 'Sets a "Prefer: handling=lenient" request header to tell the server to ignore unsupported parameters')
    .option('--post'                , 'Use POST kick-off requests')
    .option('--global'              , 'Global (system-level) export')
    .option('--no-gzip'             , 'Do not request GZipped files')
    .parse(process.argv);


function init(config) {

    if (config.client_id && !config.token_url) {
        console.error(`Your config has a "client_id" but does not have a "token_url"`.red);
        process.exit(1);
    }

    if (!config.client_id && config.token_url) {
        console.error(`Your config has a "token_url" but does not have a "client_id"`.red);
        process.exit(1);
    }

    let isLocalJwksUrl  = false;
    let isRemoteJwksUrl = false;

    if (config.jwks_url) {
        
        // Parse config.jwks_url and make sure that it points to http://localhost:{some port}/{some path}
        let jwksUrl = Url.parse(config.jwks_url);
        isLocalJwksUrl = jwksUrl.hostname === "localhost" ||
                         jwksUrl.hostname === "0.0.0.0" ||
                         jwksUrl.hostname === "127.0.0.1";
        isRemoteJwksUrl = !isLocalJwksUrl;

        if (isRemoteJwksUrl && config.jwks) {
            console.log(`WARNING: You are passing both "jwks" and remote "jwks_url". Your "jwks" will be ignored!`.red)
        }

        if (isLocalJwksUrl) {

            // Start a small server to host our JWKS at http://localhost:7000/jwks.json
            // WARNING! This URL should match a value that the backend service supplied to
            // the EHR at client registration time.
            if (jwksUrl.protocol != "http:") {
                console.error(`Only http is supported for config.jwks_url if it is on localhost`.red);
                process.exit(1);
            }

            if (!jwksUrl.port) {
                console.error(`A local config.jwks_url must specify a port`.red);
                process.exit(1);
            }

            if (+jwksUrl.port < 1024) {
                console.error(`A local config.jwks_url must use a port greater than 1024`.red);
                process.exit(1);
            }

            // Listen on the specified port and pathname and host the public keys
            const app = express();
            app.get(jwksUrl.pathname, (req, res) => {
                res.json({ keys: config.jwks.keys.filter(k => k.key_ops.indexOf("sign") == -1) });
            });
            SERVER = app.listen(+jwksUrl.port, function() {
                console.log(`The JWKS is available at http://localhost:${jwksUrl.port}${jwksUrl.pathname}`);
            });
        }
    }

    if (config.client_id) {

        if (!isRemoteJwksUrl) {
            if (!config.jwks || typeof config.jwks != "object") {
                console.error('No "jwks" object found in config. If you have a client_id, you must also have a jwks, unless you provide a remote jwks_url.'.red);
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
        }
    }

    // Make sure we show cursor after Ctrl+C is pressed while the cursor is hidden!
    // process.on('SIGINT', (code) => {
    //     if (code != 1234) {
    //         process.stdout.write("\r\033[?25h\n");
    //         process.exit(code ? 1234 : 0)
    //     }
    // });
}

function getSince()
{
    let since = String(APP._since || APP.start || "");
    if (since) {
        const instant = moment(new Date(since));
        if (instant.isValid()) {
            return instant.format();
        }
    }
    return null;
}

function buildKickOffHeaders()
{
    const headers = {
        Accept: "application/fhir+json",
        Prefer: "respond-async"
    };

    if (ACCESS_TOKEN) {
        headers.Authorization = "Bearer " + ACCESS_TOKEN;
    }

    if (APP.lenient) {
        headers.Prefer += ", handling=lenient";
    }

    return headers;
}

function buildKickOffQuery(params)
{
    const since = getSince();
    if (since) {
        params.append("_since", since);
    }

    if (APP.type) {
        params.append("_type", APP.type);
    }

    if (APP.elements) {
        params.append("_elements", APP.elements);
    }

    if (APP.includeAssociatedData) {
        params.append("includeAssociatedData", APP.includeAssociatedData);
    }

    if (APP._typeFilter) {
        params.append("_typeFilter", APP._typeFilter);
    }
}

function buildKickOffPayload()
{
    const payload = {
        resourceType: "Parameters",
        parameter: []
    };

    // _since ------------------------------------------------------------------
    const since = getSince();
    if (since) {
        payload.parameter.push({
            name: "_since",
            valueInstant: since
        });
    }

    // _type -------------------------------------------------------------------
    if (APP.type) {
        String(APP.type).trim().split(/\s*,\s*/).forEach(type => {
            payload.parameter.push({
                name: "_type",
                valueString: type
            });
        });
    }

    // _elements ---------------------------------------------------------------
    if (APP.elements) {
        payload.parameter.push({
            name: "_elements",
            valueString: APP.elements
        });
    }

    // patient -----------------------------------------------------------------
    if (APP.patient) {
        String(APP.patient).trim().split(/\s*,\s*/).forEach(id => {
            payload.parameter.push({
                name: "patient",
                valueReference: {
                    reference: `Patient/${id}`
                }
            });
        });
    }

    // _typeFilter -------------------------------------------------------------
    if (APP._typeFilter) {
        payload.parameter.push({
            name: "_typeFilter",
            valueString: APP._typeFilter
        });
    }

    return payload;
}

function kickOff()
{
    let options = {
        proxy  : APP.proxy,
        headers: buildKickOffHeaders()
    };

    const base = APP.fhirUrl.replace(/\/*$/, "/");

    if (APP.global) {
        options.url = new URL("/$export", base);
    }
    else if (APP.group) {
        options.url = new URL(`/Group/${APP.group}/$export`, base);
    }
    else {
        options.url = new URL("Patient/$export", base);
    }

    if (APP.post || APP.patient) {
        options.method = "POST";
        options.json   = true;
        options.body   = buildKickOffPayload();
    } else {
        buildKickOffQuery(options.url.searchParams);
    }

    // console.log(options)

    return lib.requestPromise(options);
}
// -----------------------------------------------------------------------------

function downloadFhir() {
    
    if (!ACCESS_TOKEN && config.jwks && config.client_id) {
        return authorize().then(downloadFhir);
    }

    let start = Date.now();

    return kickOff()
    .then(res => {
        console.log("Waiting for the server to generate the files...".green);
        STATUS_URL = res.headers["content-location"];
        return waitForFiles();
    })
    .then(files => {
        if (files.length) {
            let table = lib.createTable(files);
            table.log();
            return downloadFiles(table)
                .catch(err => { throw new Error(`Download failed: ${err.message}`); })
                .then(() => console.log(`\nAll files downloaded`.green))
        } else {
            console.log(`\nNo data was found on the server to match your export parameters`.yellow)
        }
    })
    .then(() => lib.ask("Do you want to signal the server that the export can be removed? [Y/n]"))
    .then(answer => {
        if (answer.toLowerCase() == "y") {
            return cancel();
        }
    })
    .then(() => {
        STATUS_URL = "";
        console.log(`Completed in ${lib.formatDuration(Date.now() - start)}`);
    });
}

function waitForFiles(startTime = Date.now(), timeToWait = 0) {

    // Can happen after Ctrl+C while waiting
    if (!STATUS_URL) {
        return Promise.resolve();
    }

    return lib.requestPromise({
        url: STATUS_URL,
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
            }
            return waitForFiles(startTime, 1000);
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

function downloadFiles(table) {
    for (let i = 0; i < APP.concurrency; i++) {
        downloadAttachment(table);
    }

    function waitForDownloads() {
        return lib.wait(100).then(() => {
            if (table.isComplete()) {
                // table.log();
                return "All files downloaded";
            }
            return waitForDownloads();
        });
    }

    return waitForDownloads();
}

function downloadAttachment(table) {
    let file = table.next();
    if (file) {
        file.status = "Downloading";
        table.log();

        // Create a download stream
        const download = request.get({
            strictSSL: false,
            url: file.url,
            proxy: APP.proxy,
            gzip: !!APP.gzip,
            headers: {
                Accept: "application/fhir+ndjson",
                Authorization: ACCESS_TOKEN ? "Bearer " + ACCESS_TOKEN : undefined
            }
        });

        // Count the chunks and the uncompressed bytes
        // @ts-ignore
        download.on("data", chunk => {
            file.chunks += 1;
            file.bytes += chunk.length;
        });

        // Count the compressed bytes (if gzip is on)
        // @ts-ignore
        download.on("response", response => {
            if (response.statusCode >= 400) {
                throw new Error(
                    `${response.statusCode}: ${response.statusMessage}\n${response.body}`
                );
            }
            response.on("data", data => {
                file.rawBytes += data.length;
                table.log();
            });
        });

        // Convert to stream of JSON objects
        let pipeline = download.pipe(new NdJsonStream());

        // Handle DocumentReference with absolute URLs
        pipeline = pipeline.pipe(new DocumentReferenceHandler({
            dir  : APP.dir,
            proxy: APP.proxy,
            gzip : !!APP.gzip,
            accessToken: ACCESS_TOKEN
        }));

        // Write files to FS if needed
        if (APP.dir && APP.dir != "/dev/null") {
            pipeline = pipeline.pipe(fs.createWriteStream(`${APP.dir}/${file.name}`));
        }

        stream.finished(pipeline, error => {
            if (error) {
                file.status = "FAILED";
                table.log();
                ERROR_LOG.push(error);
            } else {
                file.status = "Done";
                table.log()
                return downloadAttachment(table);
            }
        })

        if (!APP.dir || APP.dir == "/dev/null") {
            pipeline.resume();
        }
    }
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

    // Convert the private JWK to PEM private key to sign with
    let privateKey = jwkToPem(pair.privateKey, { private: true });

    // Sign the jwt with our private key
    let signed = jwt.sign(jwtToken, privateKey, {
        algorithm: alg,
        keyid: kid,
        header: {
            jku: config.jwks_url || undefined,
            kty: pair.privateKey.kty
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

function cancel() {
    return lib.requestPromise({
        method: "DELETE",
        url: STATUS_URL,
        proxy: APP.proxy,
        json: true,
        headers: ACCESS_TOKEN ? {
            Authorization: "Bearer " + ACCESS_TOKEN
        } : {}
    }).then(
        () => {
            console.log("The export was removed!".bold.green);
        },
        err => {
            console.log("Failed to remove the export!".bold.red);
            console.error(String(err).red);
        }
    );
}

process.on("SIGINT", () => {
    if (STATUS_URL) {
        console.log("\nExport canceled. Aborting...");
        cancel().then(() => {
            STATUS_URL = "";
            process.exit();
        });
    }
    else {
        console.log("\nThe export was canceled!".bold.green);
        process.exit();
    }
});

// RUN! ------------------------------------------------------------------------
if (APP.fhirUrl) {
    init(config);
    
    downloadFhir().then(() => {
        if (SERVER) SERVER.close();

        if (ERROR_LOG.length) {
            console.log("============================");
            console.log("ERRORS");
            console.log("============================");
            ERROR_LOG.forEach(e => console.error);
            ERROR_LOG = [];
        }

    }).catch(err => {
        
        // Check if this is an expired token error
        if (String(err).search(/expired/i) > -1) {
            
            // If so, clear the local token to trigger re-authorization
            ACCESS_TOKEN = null;

            // and then try again
            return downloadFhir();
        }
        
        console.error(String(err.message).red);
    }).then(() => process.exit());
}
else {
    APP.help();
}
