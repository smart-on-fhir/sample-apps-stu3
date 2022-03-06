function urlParam(p) {
    var query  = location.search.replace(/^\?/, "");
    var data   = query.split("&");
    var result = [];
    var i, item;

    for (i = 0; i < data.length; i++) {
        item = data[i].split("=");
        if (item[0] === p) {
            return decodeURIComponent(item[1].replace(/\+/g, '%20'));
        }
    }

    return null;
}

function getRedirectURI() {
    return (location.protocol + "//" + location.host + location.pathname)
        .match(/(.*\/)[^\/]*/)[1];
}

function refreshApp() {
    location.href = getRedirectURI();
}

function initialize(settings) {
    setSettings({
        clientId     : settings.clientId,
        clientSecret : settings.clientSecret,
        scope        : settings.scope,
        launch       : urlParam("launch"),
        iss          : urlParam("iss")
    });
    clearAuthToken();
    refreshApp();
}

function completeAuth() {
    FHIR.oauth2.ready(refreshApp);
}

function writeData(key, data) {
    sessionStorage[key] = JSON.stringify(data);
}

function readData(key) {
    var data = sessionStorage[key];
    if (data) {
        return JSON.parse(data);
    }
    return data;
}

function getSettings() {
    return readData("app-settings");
}

function setSettings(data) {
    writeData("app-settings", data);
}

function hasAuthToken() {
    return sessionStorage.SMART_KEY !== undefined;
}

function clearAuthToken() {
    let key = sessionStorage.SMART_KEY;
    if (key) delete sessionStorage[key.substring(1,key.length-1)];
    delete sessionStorage.SMART_KEY;
}

function getHumanName(name) {
    return name.map((name) => name.given.join(" ") + " " + name.family).join(" / ");
}

function authorize() {
    var settings = getSettings();

    FHIR.oauth2.authorize({
        "clientId"     : settings.clientId,
        "scope"        : settings.scope,
        "clientSecret" : settings.clientSecret,
        "launch"       : settings.launch,
        "iss"          : settings.iss
    });
}

function getPatientName() {
    var ret = $.Deferred();

    FHIR.oauth2.ready(function(client) {
        client.patient.read().then(function(pt) {
            ret.resolve(getHumanName(pt.name));
        }, function() {
            ret.reject("Could not fetch patient name");
        });
    });

    return ret.promise();
}

function getUserName() {
    var ret = $.Deferred();

    FHIR.oauth2.ready(function(client){
        client.user.read()
        .then(function(pt) {
            if (pt) {
                if (pt.resourceType === "Practitioner" ||
                    pt.resourceType === "RelatedPerson" ||
                    pt.resourceType === "Patient")
                {
                    ret.resolve(getHumanName(pt.name));
                }
                else {
                    ret.reject("Could not fetch user name");
                }
            }
            else {
                ret.resolve(pt);
            }
        }, function(error) {
            window.SMART = smart
            console.log(smart)
            console.log(error)
            ret.reject("Could not fetch user name: " + error);
        });
    });

    return ret.promise();
}