const stream  = require("stream");
const request = require("request");
const uuid    = require("uuid");
const fs      = require("fs");
const path    = require("path");
const lib     = require("../lib");


const ContentTypeToExtension = {
    "image/jpeg"     : "jpeg",
    "text/plain"     : "txt",
    "application/pdf": "pdf"
};

class DocumentReferenceHandler extends stream.Transform
{
    constructor(options)
    {
        super({
            readableObjectMode: true,
            writableObjectMode: true
        });

        this.options = options;

        this.num = 1;
    }

    _transform(resource, encoding, callback)
    {
        const resourceType = resource.resourceType;

        if (!resourceType) {
            return callback(new Error(
                `No resourceType found for resource number ${this.num}.`
            ));
        }

        if (!resource.id && resourceType !== "Bundle") {
            return callback(new Error(
                `No "id" found for resource number ${this.num}.`
            ));
        }

        const next = () => {
            this.push((this.num > 1 ? "\n" : "") + JSON.stringify(resource));
            this.num++;
            callback();
        };

        if (resourceType == "DocumentReference") {
            const url = String(lib.getPath(resource, "content.0.attachment.url") || "");
            if (url.search(/^https?:\/\/.+/) === 0) {
                const fileName = uuid.v5(url, uuid.v5.URL);
                const downloadStream = request({
                    url,
                    proxy: this.options.proxy,
                    gzip : !!this.options.gzip,
                    headers: {
                        Authorization: this.options.accessToken ? "Bearer " + this.options.accessToken : undefined
                    }
                });

                const cType = lib.getPath(resource, "content.0.attachment.contentType") || "text/plain";
                const ext   = ContentTypeToExtension[cType];

                let pipeline;

                if (this.options.dir && this.options.dir != "/dev/null") {
                    const dir = path.join(this.options.dir, "attachments");
                    fs.mkdirSync(dir, { recursive: true });
                    const writeStream = fs.createWriteStream(
                        path.join(dir, fileName + "." + ext
                    ));
                    pipeline = downloadStream.pipe(writeStream);
                }

                else {
                    pipeline = downloadStream.pipe(new stream.Writable({
                        write(chunk, encoding, callback) {
                            callback();
                        }
                    }));
                }

                stream.finished(pipeline, error => {
                    if (error) {
                        callback(error);
                    } else {
                        resource.content[0].attachment.url = fileName;
                        next();
                    }
                });
            }
            else {
                next();
            }
        }
        else {
            next();
        }
    }
}

module.exports = DocumentReferenceHandler;
