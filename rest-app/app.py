# TO DO
#    [ ] encrypt the state to protect app secrets
#    [ ] add logic to trim the session object when it gets too big before werkzeug crashes instead of
#        clearing the session object on each run
#    [ ] enable client secret between auth server and sample app
#    [ ] add configuration options and suggestions for session storage mechanism

from flask import Flask, request, redirect, session, url_for
from fhirclient import client
from fhirclient.models.medicationrequest import MedicationRequest

settings = {
    'app_id': 'my_web_app'
}

application = app = Flask('wsgi')
app.debug = True
app.secret_key = 'khsathdnsthjre'  # CHANGE ME

def _save_state(state):
    session['state'] = state

def _get_smart():
    state = session.get('state')
    if state:
        return client.FHIRClient(state=state, save_func=_save_state)
    else:
        return client.FHIRClient(settings=settings, save_func=_save_state)
        
def _get_prescriptions(smart):
    return MedicationRequest.where({'patient': smart.patient_id}).perform(smart.server).entry

def _med_name(med):
    if med.text:
        return med.text
    if med.coding and med.coding[0].display:
        return med.coding[0].display
    return "Unnamed Medication(TM)"

@app.route('/fhir-app/launch.html')
def launch():
    session.clear()
    iss = request.args.get('iss', '')
    
    if iss:
        settings.update({
            'api_base': iss,
            'auth_type': 'oauth2',
            'launch_token': request.args.get('launch', ''),
            'redirect_uri': request.url.split('/fhir-app')[0] + url_for('authorize')
        })
        smart = _get_smart()
        auth_url = smart.authorize_url
        return redirect(auth_url)
        
    fhirServiceUrl = request.args.get('fhirServiceUrl', '') 
        
    if fhirServiceUrl:
        settings['api_base'] = fhirServiceUrl
        settings['patient_id'] = request.args.get('patientId', '')
        settings['auth_type'] = 'none'
        smart = _get_smart()
        redirect_url = request.url.split('/fhir-app')[0] + url_for('index')
        return redirect(redirect_url)

    # Heuston, we have a problem
    raise Exception("Launch sequence aborted")

@app.route('/fhir-app/authorize.html')
def authorize():
    smart = _get_smart()
    smart.handle_callback(request.url)
    return redirect(url_for('index'))
    
@app.route('/fhir-app/')
def index():
    smart = _get_smart()
    
    if smart.ready and smart.patient is not None:
        out = """<!DOCTYPE html>
            <html>
              <head><title>Sample REST App</title></head>
              <body>
        """

        name = smart.human_name(smart.patient.name[0] if smart.patient.name and len(smart.patient.name) > 0 else 'Unknown')
        out += "<h1>Medications for <span id='name'>%s</span></h1>\n" % name
        
        out += "<ul id='med_list'>\n"
    
        prescriptions = _get_prescriptions(smart)
        for pres in prescriptions:
            med = pres.resource.medicationCodeableConcept
            out += '<li>%s</li>\n' % _med_name(med)
    
        out += """
            </ul>
           </body>
          </html>"""
    
        return out
    
if __name__ == '__main__':
    app.run(port=8000)
