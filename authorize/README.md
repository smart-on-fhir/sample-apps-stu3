# Authorization Example

This is simple app that lets the selected patient sign in and out.
Please see the code for details.


## Install & Run
Install NodeJS, go to the app directory and run:
```sh
npm i
npm start
```

You should see something like

    Starting up http-server, serving ./
    Available on:
        http://127.0.0.1:9090
        http://10.23.49.21:9090

You can stop the server if needed using <kbd>Ctrl+C</kbd>.

Now go the sandbox at https://sandbox.smarthealthit.org/smartdstu3/#/manage-apps
and `Register New App Manually` using the following data:

    App Type          : Public Client
    App Name          : Whatever
    App Launch URI    : http://127.0.0.1:9090/launch.html
    App Redirect URIs : http://127.0.0.1:9090
    Patient Scoped App: true (checked)
    Scopes            : patient/*.read

When you save the app new `Client Id` will be presented to you. Copy that ClientID,
open the file `launch.html` and replace the old id (`my_web_app`) with the new one.
Now you can return to the sandbox, click the **Launch** button below your app, choose
a patient and see how it works.
