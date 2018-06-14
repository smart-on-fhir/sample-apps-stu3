# CDS Hooks Service

This is a sample CDS Hooks Service that demonstrates how to launch a SMART app from a card in the EHR.
If you prescribe a medication to patient who is less than 18 years old, a card will be displayed
containing al link for launching the PGC application. Please see the code for more details.


## Install & Run

Install NodeJS, Go to the app directory and run:
```sh
npm i
npm start
```

You can stop the server if needed using <kbd>Ctrl+C</kbd>.

Now that the your cds services server is running go to the launcher (https://launch.smarthealthit.org/),
select the "CDS Hooks Service" Launch Type, select a Patient and Provider,
enter "http://localhost:3000/cds-services" as Discovery Endpoint URL and click
"Launch". Then in the CDS Hooks Sandbox prescribe whatever medication and if
the chosen patient is 18 years old or younger you should se a card wit a launch link.

NOTE: Proper patient to launch with would be anybody having vital sign observations,
conditions and age <= 18 years.

- [Example with young patient](https://launch.smarthealthit.org/?auth_error=&fhir_version_1=r2&fhir_version_2=r3&iss=&launch_cds=1&launch_url=&patient=d0d0cde0-4b21-42f6-9c1e-bfa447d72059&prov_skip_auth=1&prov_skip_login=1&provider=smart-Practitioner-71614502&pt_skip_auth=1&public_key=&sb=&sde=http%3A%2F%2Flocalhost%3A3000%2Fcds-services&token_lifetime=15&user_pt=)
- [Example with older patient (no card shown)](https://launch.smarthealthit.org/?auth_error=&fhir_version_1=r2&fhir_version_2=r3&iss=&launch_cds=1&launch_url=&patient=smart-1213208&prov_skip_auth=1&prov_skip_login=1&provider=smart-Practitioner-71614502&pt_skip_auth=1&public_key=&sb=&sde=http%3A%2F%2Flocalhost%3A3000%2Fcds-services&token_lifetime=15&user_pt=)


