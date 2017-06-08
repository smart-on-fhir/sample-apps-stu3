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
    return fetchToken().then(refreshApp);
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

function clearData(key) {
    delete sessionStorage[key];
}

function getAuthToken() {
    return readData("auth-token");
}

function setAuthToken(data) {
    writeData("auth-token", data);
}

function clearAuthToken() {
    clearData("auth-token");
}

function getSettings() {
    return readData("app-settings");
}

function setSettings(data) {
    writeData("app-settings", data);
}

function getSession(key) {
    return readData(key);
}

function setSession(data) {
    var key = Math.round(Math.random() * 100000000).toString();
    writeData(key, data);
    return key;
}

function hasAuthToken() {
    return getAuthToken() !== undefined;
}

function fetchToken() {
    var settings = getSettings();
    var state    = urlParam("state");
    var code     = urlParam("code");
    var params   = getSession(state);
    var data = {
        code        : code,
        grant_type  : 'authorization_code',
        redirect_uri: getRedirectURI()
    };
    var options;

    if (!settings.secret) {
        data['client_id'] = settings.client_id;
    }

    options = {
        url : params.token_uri,
        type: 'POST',
        data: data
    };

    if (settings.secret) {
        options['headers'] = {
            'Authorization': 'Basic ' + btoa(settings.client_id + ':' + settings.secret)
        };
    }

    return $.ajax(options).then(function(res) {
        setAuthToken({
            patient_id : res.patient,
            access_token: res.access_token
        });
    });
}

function authorize() {
    var settings = getSettings();

    $.get(
        settings.api_server_uri + "/metadata",
        function(r) {
            var authorize_uri = null;
            var token_uri     = null;

            var smartExtension = r.rest[0].security.extension.filter(function (e) {
               return (e.url === "http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris");
            });

            smartExtension[0].extension.forEach(function(arg, index, array) {
                if (arg.url === "authorize") {
                    authorize_uri = arg.valueUri;
                }
                else if (arg.url === "token") {
                    token_uri = arg.valueUri;
                }
            });

            var state = setSession({
                token_uri: token_uri
            });

            var redirect_to=authorize_uri + "?" + 
                "client_id="+settings.client_id+"&"+
                "response_type=code&"+
                "scope="+settings.scope+"&"+
                "redirect_uri="+getRedirectURI() + "&" +
                "aud=" + encodeURIComponent(settings.api_server_uri) + "&" +
                "launch=" + settings.launch_id + "&" +
                "state=" + state;

            location.href = redirect_to;
        },
        "json"
    );
}

function getPatientName() {
    var api_server_uri = getSettings().api_server_uri;
    var patient_id     = getAuthToken().patient_id;
    var access_token   = getAuthToken().access_token;
    var url            = api_server_uri + '/Patient/' + patient_id;

    return $.ajax({
        type    : 'GET',
        url     : url,
        dataType: 'json',
        headers : {
            'Authorization': "Bearer " + access_token
        }
    }).then(
        function(pt) {
            return pt.name[0].given.join(" ") + " " + pt.name[0].family;
        },
        function() {
            return "Could not fetch " + url;
        }
    );
}
