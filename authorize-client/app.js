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
        client_id     : settings.client_id,
        secret        : settings.secret,
        scope         : settings.scope + " launch",
        launch_id     : urlParam("launch"),
        api_server_uri: urlParam("iss")
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
    return sessionStorage.tokenResponse !== undefined;
}

function clearAuthToken() {
    delete sessionStorage.tokenResponse;
}

function getHumanName(name) {
    return name.given.join(" ") + " " + name.family;
}

function authorize() {
    var settings = getSettings();

    FHIR.oauth2.authorize({
        "client": {
            "client_id": settings.client_id,
            "scope"    : settings.scope,
            "launch"   : settings.launch_id
        },
        "server": settings.api_server_uri
    });
}

function getPatientName() {
    var ret = $.Deferred();

    FHIR.oauth2.ready(function(smart) {
        var patient = smart.patient;
        patient.read().then(function(pt) {
            ret.resolve(getHumanName(pt.name[0]));
        }).fail(function() {
            ret.reject("Could not fetch patient name");
        });
    });

    return ret.promise();
}

function getUserName() {
    var ret = $.Deferred();

    FHIR.oauth2.ready(function(smart){
        var user = smart.user;
        
        // smart.userId = "Patient/" + smart.userId
        $.when(user.read())
        .then(function(pt) {
            if (pt) {
                if (pt.resourceType === "Practitioner" ||
                    pt.resourceType === "RelatedPerson" ||
                    pt.resourceType === "Patient")
                {
                    ret.resolve(getHumanName(pt.name[0]));
                }
                else {
                    ret.reject("Could not fetch user name");
                }
            }
            else {
                ret.resolve(pt);
            }
        })
        .fail(function(error) {
            window.SMART = smart
            console.log(smart)
            console.log(error)
            ret.reject("Could not fetch user name: " + error);
        });
    });

    return ret.promise();
}