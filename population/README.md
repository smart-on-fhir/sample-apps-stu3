# Population

This is simple app finds all the patients that er taking medications and then
counts those medications. Please see the code for details.


## Install & Run
Install NodeJS, Go to the app directory and run:
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
    Scopes            : user/*.*

When you save the app new `Client Id` will be presented to you. Copy that ClientID,
open the file `launch.html` and replace the old id (`my_web_app`) with the new one.
Now you can return to the sandbox, click the **Launch** button below your app,
and see how it works.

You can launch it with a patient and then it will only count the meds of the
selected patient. Otherwise, it will find all the patients that are taking medications.

IMPORTANT! Be careful if launching without a patient. Depending on the data available,
the app may do many requests, put the server under heavy load and it may take a long
time to compute the final results.

