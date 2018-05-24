# Medications List - Standalone

This is the same [medications app](../medications) but it supports standalone launch
(can be launched directly. Please see the code for details.


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

At this point your Launch URI is http://127.0.0.1:9090/launch.html. Since this
is a standalone launch-able app you can start it simply by opening it's
[Launch URL](http://127.0.0.1:9090/launch.html).