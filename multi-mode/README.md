# Multi Mode Demo App

This is simple app that can be launched in embedded, standalone, and population modes


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

To launch:

http://127.0.0.1:9090/launch-embedded.html?launch=eyJhIjoiMSJ9&iss=http%3A%2F%2Flaunch.smarthealthit.org%2Fv%2Fr3%2Ffhir

http://127.0.0.1:9090/launch-standalone.html

http://127.0.0.1:9090/launch-population.html