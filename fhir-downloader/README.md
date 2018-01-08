# Example FHIR Downloader (Backend Service/Bulk Data) App

This is a sample CLI app that demonstrates how to implement the spec from http://wiki.hl7.org/index.php?title=201801_Bulk_Data.

## Screenshot
<img src="screenshot.png" width="650" />

## Install and run
```sh
git clone git@github.com:smart-on-fhir/sample-apps-stu3.git
cd sample-apps-stu3/fhir-downloader
npm i && node .
```


By default the script will download all the files to the `./downloads` folder. However, you might often want to change that or just test it without actually downloading anything. To do so you can set the `DOWNLOAD_DIR` environment variable. For example, if you don't want to save the downloaded files you can do `DOWNLOAD_DIR="/dev/null" node .`
