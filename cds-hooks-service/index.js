const express    = require("express");
const cors       = require("cors");
const bodyParser = require("body-parser");
const moment     = require("moment");

const app = express();

app.use(express.static("static"));
app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json());

// list services
app.get("/cds-services", (req, res) => res.json({
    services: [
        {
            hook: "medication-prescribe",
            title: "Offer App Upon Prescription",
            description: "An example of a CDS Service that offers launching a SMART app after a medication is prescribed",
            "id": "app-launcher",
            "prefetch": {
                "patient": "Patient/{{context.patientId}}"
            }
        }
    ]
}));

app.post("/cds-services/:id", (req, res) => {
    let out = {};
    let patient = req.body.prefetch.patient;

    do {

        // If the patient is not pre-fetched don't render a card
        if (!patient) {
            break;
        }

        // If we know that the patient is deceased but we don't know when s(he)
        // died, then we cannot compute if s(he) is good candidate for a
        // pediatric app.
        if (patient.deceasedBoolean) {
            break;
        }

        let startDate = moment(patient.birthDate);
        let endDate   = moment(patient.deceasedDateTime || []);
        let age       = endDate.diff(startDate, "years");

        // Don't offer to launch a pediatric app for patients older than 19 years
        if (age > 18) {
            break;
        }

        out.cards = [{
            summary  : "Please launch this app!",
            indicator: "warning",
            detail   : '<img src="http://localhost:3000/app.png"/>',
            links: [
                {
                    "label": "Pediatric Growth Charts",
                    "type" : "smart",
                    "url"  : "https://examples.smarthealthit.org/growth-chart-app/launch.html"
                }
            ]
        }];
    } while( false );

    res.json(out);
});


app.listen(3000, () => console.log("Listening on port 3000!"));
