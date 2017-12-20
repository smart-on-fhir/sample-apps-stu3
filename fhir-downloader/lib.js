require("colors");

const request  = require("request");

/**
 * Just a wrapper around "request" to make it return a promise. There is also a
 * delay option
 * @param {Object} options
 * @param {Number} delay [0] Delay in milliseconds
 * @returns {Promise<Object>}
 */
function requestPromise(options, delay = 0) {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
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
        }, delay);
    });
}

/**
 * Generates a progress indicator
 * @param {Number} pct The percentage
 * @returns {String}
 */
function generateProgress(pct=0, length=40) {
    pct = parseFloat(pct);
    if (isNaN(pct) || !isFinite(pct)) {
        pct = 0;
    }
    let spinner = "", bold = [], grey = [];
    for (let i = 0; i < length; i++) {
        if (i / length * 100 >= pct) {
            grey.push("▉");
        }
        else {
            bold.push("▉");
        }
    }

    if (bold.length) {
        spinner += bold.join("").bold;
    }

    if (grey.length) {
        spinner += grey.join("").grey;
    }

    if (pct < 10) pct = "  " + pct;
    else if (pct < 100) pct = " " + pct;

    return "\r\033[2K" + `${pct}% `.bold + `${spinner} `;
}

module.exports = {
    requestPromise,
    generateProgress
};