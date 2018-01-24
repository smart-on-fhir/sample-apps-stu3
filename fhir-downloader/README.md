# Example FHIR Downloader (Backend Service/Bulk Data) App

This is a sample CLI app that demonstrates how to implement the spec from http://wiki.hl7.org/index.php?title=201801_Bulk_Data.

## Screenshot
<img src="screenshot.png" width="650" />

## Install

First you have to install NodeJS if you don't already have it from https://nodejs.org/. This app has been developed on Node version 7.9 and also tested on Node 8. In case you have older version you might need to also install a newer one. This is easy to do using the Node Version Manager from https://github.com/creationix/nvm. Then clone the code and install the dependencies:
```sh
git clone https://github.com/smart-on-fhir/sample-apps-stu3.git
cd sample-apps-stu3/fhir-downloader
npm i
```

## Run
```sh
node . -d /dev/null
```

## Configuration

The most common options are available as CLI arguments. However, if you want to use this with protected servers using the backend services auth, there are some settings that are loaded from a config file called `config.json` in the project root folder. This file is not required but we have included an example configuration in `config.example.json` that you can just rename. The options that can be defined there are:
- `fhir_url` - can be overridden by the `-f` or `--fhir-url` parameter
- `private_key` 
- `client_id` 
- `token_url`
- `service_url`
Tools like https://bulk-data.smarthealthit.org/ can generate such a config file and you can just download and use it (note the "Download as JSON" button). For more details check out the backend services spec at http://docs.smarthealthit.org/authorization/backend-services/.


## Options

- `-V, --version` - output the version number
- `-f, --fhir-url [url]` - FHIR server URL. Defaults to the `fhir_url` option from the config file (if any)
- `-T, --type [list]` - Zero or more resource types to download. If omitted downloads everything
- `-s, --start [date]` - Only include resources modified after this date
- `-g, --group [id]` - Group ID - only include resources that belong to this group
- `-d, --dir [directory]` - Download destination (default:`./downloads`)
- `-p, --proxy [url]` - Proxy server if needed
- `-h, --help` - output usage information


