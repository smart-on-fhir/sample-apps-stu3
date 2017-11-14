const request   = require("request");
const jwt       = require("jsonwebtoken");
const crypto    = require("crypto");
const base64url = require("base64-url");
const config    = require("./config.json");


// The (last known) access token is stored in this global variable. When it
// expires the code should re-authenticate and update it.
let ACCESS_TOKEN;

// Count how many times we ran this. This is just an example app so make sure
// we don't let it run forever!
let TIMES_RAN = 0;

/**
 * Just a wrapper around "request" to make it return a promise
 * @param {Object} options
 * @returns {Promise<Object>}
 */
function requestPromise(options) {
    return new Promise((resolve, reject) => {
        request(Object.assign({ strictSSL: false }, options), (error, res) => {
            if (error) {
                return reject(error);
            }
            if (res.statusCode >= 400) {
                return reject(new Error(
                    `${res.statusCode}: ${res.statusMessage}\n${res.body}`
                ));
            }
            resolve(res);
        });
    });
}

/**
 * Counts the number of patients on the server. If we have not yet authenticated
 * it will do so first and then try again.
 * @returns {Promise<Number>}
 */
function getPatients() {

    if (++TIMES_RAN > 49) {
        console.log(
            "This was just an example app designed to exit after " +
            "50 FHIR calls.\nGood bye!"
        );
        process.exit(0);
    }

    // (re)authorize if needed
    if (!ACCESS_TOKEN) {
        return authorize().then(getPatients);
    }

    // Query the "/Patient" to get the patient count
    return requestPromise({
        url: config.fhir_url + "/Patient",
        json: true,
        headers: {
            authorization: "Bearer " + ACCESS_TOKEN
        }
    }).then(

        // Return the total number of patients
        res => res.body.total,

        // In case of error
        err => {

            // Check if this is an expired token error
            if (err.message.search(/expired/i) > -1) {

                // If so, clear the local token to trigger re-authorization
                ACCESS_TOKEN = null;

                // and then try again
                return getPatients();
            }

            // Otherwise just return the error
            return Promise.reject(err);
        }
    );
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

    return requestPromise({
        method: "POST",
        url   : config.token_url,
        json  : true,
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
    });
}

/**
 * Count the patients on the server and log the result to the terminal.
 * @param {Number} retryAfter If provided, the app will count the patients and
 *                            then continue try agin after the specified number
 *                            of milliseconds
 */
function countPatients(retryAfter) {
    getPatients().then(
        n => {
            console.log(`There are ${n} patients on the server`);
            if (retryAfter) {
                setTimeout(() => countPatients(retryAfter), retryAfter);
            }
        },
        e => console.log(e.message)
    );    
}

// =============================================================================
// RUN!
// =============================================================================
countPatients(20000); // Check each 20 seconds
