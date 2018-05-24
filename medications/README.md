# Medications List

This is simple app lists all the medications (af any) that the selected patient is taking.
Please see the code for details.


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

At this point your Launch URI is http://127.0.0.1:9090/launch.html and your
Redirect URI is http://127.0.0.1:9090. The easiest way to launch the app is to
go to https://launch.smarthealthit.org, paste your launch url at the bottom and
click "Launch". Alternatively, you can just click this link to launch:

http://127.0.0.1:9090/launch.html?launch=eyJhIjoiMSJ9&iss=http%3A%2F%2Flaunch.smarthealthit.org%2Fv%2Fr3%2Ffhir
