Chrome Timeline

** Everything namespaced off WebInspector

** UI Inheritance - specific views inherit from WebInspector.Object, then View, then generally something a bit more specialized like VBox

For example ui/TabbedPane:
    WebInspector.Object-> WebInspector.View -> WebInspector.VBox -> WebInspector.TabbedPane


** Mode Inheritance

Larger models inherit from WebInspector.Object or a specialize Model.


WebInspector.Object handles things event dispatching

WebInspector.View generic view functions

** Debugging

Clone dt-tools, run ./startdevtools -> opens canary

add new tab go to localhost:8081 (simple app)

Refresh inspectable pages tab

Open inspectable localhost:8081 in a new window -> loads dev tools

press cmd+option+j to open devtools on devtools (on devtools...just kidding). Now you are debugging devtools with devtools (with devtools...okay I'll stop)

you can use console.log and debugger to work

** The Timeline:

Start up - break point constructor of TimelineModel.js (seems like a logical start?)

Run the app, select the timeline panel, TimelineModel constructor hits. Note the stack trace:

createPanel:RuntimeExtensionPanelDescriptor:panel.js ->
    createPanel:TimelinePanelFactory:TimelinePanel.js ->
        instance:TimelinePanel:TimelinePanel.js ->
            constructor:TimelinePanel:TimelinePanel.js ->
                constructor:TimelineModel:TimelineModel.js

The first bits are generic panel construction (which we'll circle to how that abstraction works to add more panels later). The lower calls are what we're interested in.

Basically the framework creates an instance of TimelinePanel which is our composite root for the timeline app. It creates and assembles the model and the view.

Things of note - it creates:

A tracing manager:

```javascript
this._tracingManager = new WebInspector.TracingManager();
this._tracingManager.addEventListener(WebInspector.TracingManager.Events.BufferUsage, this._onTracingBufferUsage, this);
this._tracingManager.addEventListener(WebInspector.TracingManager.Events.RetrieveEventsProgress, this._onRetrieveEventsProgress, this);
```

A tracing model:
```
this._tracingModel = new WebInspector.TracingModel();
```

A timeline model:
```
this._model = new WebInspector.TimelineModel(this._tracingManager, this._tracingModel, WebInspector.TimelineUIUtils.hiddenRecordsFilter());
```

Wires important events:

```
this._model.addEventListener(WebInspector.TimelineModel.Events.RecordingStarted, this._onRecordingStarted, this);
this._model.addEventListener(WebInspector.TimelineModel.Events.RecordingStopped, this._onRecordingStopped, this);
this._model.addEventListener(WebInspector.TimelineModel.Events.RecordsCleared, this._onRecordsCleared, this);
this._model.addEventListener(WebInspector.TimelineModel.Events.RecordFilterChanged, this._refreshViews, this);
```

Note, the rest of the panel constructor creates some views, but specifically the TimelineView constructor doesn't fire.

Mostly, we're interested in tracingManager. Earlier we saw where the _tracingManager member gets wired for events. TimelineModel also wires it up for events and for a more interesting set:

```
    this._tracingManager.addEventListener(WebInspector.TracingManager.Events.TracingStarted, this._onTracingStarted, this);
    this._tracingManager.addEventListener(WebInspector.TracingManager.Events.EventsCollected, this._onEventsCollected, this);
    this._tracingManager.addEventListener(WebInspector.TracingManager.Events.TracingComplete, this._onTracingComplete, this);
```

This seems to inform the model as to the state of tracing. Lets look at each of these handlers to get an idea what the model is going to do at each stage:

_onTracingStarted - seems to reset itself and the tracingmodel and then alert any of it's listeners that tracing has started

```
    //_onTracingStarted->_startCollectingTraceEvents
    _startCollectingTraceEvents: function(fromFile)
        {
            this._tracingModel.reset();
            this.reset();
            this.dispatchEventToListeners(WebInspector.TimelineModel.Events.RecordingStarted, { fromFile: fromFile });
        },

```

_onEventsCollected - seems to shuffle events from the manager to the TracingModel
```
   /**
     * @param {!WebInspector.Event} event
     */
    _onEventsCollected: function(event)
    {
        var traceEvents = /** @type {!Array.<!WebInspector.TracingManager.EventPayload>} */ (event.data);
        this._tracingModel.addEvents(traceEvents);
    },
```

_onTracingComplete - signals a stop in processing. It calls _didStopRecordingTraceEvents which does some important stuff, but lets circle to that once we understand where the data comes from.
```
 _onTracingComplete: function()
    {
        if (!this._allProfilesStoppedPromise) {
            this._didStopRecordingTraceEvents();
            return;
        }
        this._allProfilesStoppedPromise.then(this._didStopRecordingTraceEvents.bind(this));
        this._allProfilesStoppedPromise = null;
    },

```


Let's put a break point in _onEventsCollected and look at the stack there. Start and stop the timeline. Note, _onEventsCollected doesn't fire until after we call stop. Interesting. I wonder if the backend potentially buffers or if the intention is down the road this method gets called periodically?

Stack:
```
WebInspector.TimelineModel._onEventsCollected (TimelineModel.js:625)
WebInspector.Object.dispatchEventToListeners (Object.js:108)
WebInspector.TracingManager._eventsCollected (TracingManager.js:93)
WebInspector.TracingDispatcher.dataCollected (TracingManager.js:172)
InspectorBackendClass.DispatcherPrototype.dispatch (InspectorBackend.js:1047)
InspectorBackendClass.Connection.dispatch (InspectorBackend.js:500)
InspectorBackendClass.WebSocketConnection._onMessage (InspectorBackend.js:690)
```

Here we can see WebInspector.Object's dispatcher base code at work. InspectorBackend.WebSocketConnection extends from InspectorBackendClass.Connection.prototype which extends from WebInspector.Object and is used to dispatach messages to listeners as the under pinnings of a good decoupled system. If you look at 'this' while in _onMessage you
ll notice the websocket is responsible for communicating with ws://localhost:9222/devtools/page/DD3953ED-F257-407C-8B12-AAC308C1EAAE" and that the parameter "message" is a MessageEvent containing what appears to be trace data in the .data member:

```
console> message.data
"{ "method": "Tracing.dataCollected", "params": { "value": [{"cat":"disabled-by-default-devtools.timeline","pid":762,"tid":1287,"ts":4005152366,"ph":"I","name":"TracingStartedInPage","args":{"data":{"sessionId":"762.9","page":"0x7fe4a3e22020"}},"tts":478070,"s":"g"},{"cat":"disabled-by-default-devtools.timeline","pid":762,"tid":1287,"ts":4005152381,"ph":"I","name":"SetLayerTreeId","args":{"data":{"sessionId":"762.9","layerTreeId":1}},"tts":478078,"s":"g"},{"cat":"disabled-by-default-devtools.timeline","pid":762,"tid":1287,"ts":4005152393,"ph":"E","name":"Program","args":{},"tts":478088},{"cat":"disabled-by-default-devtools.timeline","pid":762,"tid":1287,"ts":4006290966,"ph":"B","name":"Program","args":{},"tts":478189},{"cat":"disabled-by-default-devtools.timeline","pid":762,"tid":1287,"ts":4006291011,"ph":"E","name":"Program","args":{},"tts":478215},{"cat":"disabled-by-default-devtools.timeline","pid":762,"tid":1287,"ts":4010624770,"ph":"B","name":"Program","args":{},"tts":478279},{"cat":"disabled-by-default-

....truncated....

```
The data portion is what gets dispatched per:

```
    _onMessage: function(message)
    {
        var data = /** @type {string} */ (message.data)
        this.dispatch(data);
    }
```

InspectorBackendClass.Connection is then responsible for parsing the data if it's a string. At this point we can see the "method" portion of the data package which Connection splits on '.', using the first portion as a domain key to a map of dispatchers and the second as method target in the dispatch method. The method target is then used as a method name which is called inside the dispatch in InspectorBackend.DispatcherPrototype. This function also seems able to target specific data in the message object. I'm not quite sure where this gets set up yet, but for example prior to invoking the delegate we see:

```
if (!this._dispatcher)
            return;

        if (!(functionName in this._dispatcher)) {
            console.error("Protocol Error: Attempted to dispatch an unimplemented method '" + messageObject.method + "'");
            return;
        }

        if (!this._eventArgs[messageObject.method]) {
            console.error("Protocol Error: Attempted to dispatch an unspecified method '" + messageObject.method + "'");
            return;
        }

        var params = [];
        if (messageObject.params) {
            var paramNames = this._eventArgs[messageObject.method];
            for (var i = 0; i < paramNames.length; ++i)
                params.push(messageObject.params[paramNames[i]]);
        }
```

Where only data requested in paramNames is pushed into the actual delegate:

```
 this._dispatcher[functionName].apply(this._dispatcher, params);
```

this._eventArgs is initialized in advance with the protocol each is interested in. This may tie back to protocol.json which I don't fully grok yet. But _eventArgs looks like:

```
Object {Tracing.dataCollected: Array[1], Tracing.tracingComplete: Array[0], Tracing.bufferUsage: Array[3]}
....
Object Tracing.dataCollected: Array[1]
    0: "value" length: 1
```

The tracingdispatcher thus has dataCollected invoked, it in turn directly calls the tracingManager._eventsCollected method with the data. The tracingManager then dispatches out to it's listeners that events were received, buffering them.  The TimelineModel being one of these listeners then adds them to the tracingModel.


AddEvent in the TracingModel is pretty sizeable and operates on a given event. While we're here, lets look at what is being passed in:

```
{
	"cat": "disabled-by-default-devtools.timeline",
	"pid": 762, //process id, used to map to a WebInspector.Process obj
	"tid": 1287, //thread id
	"ts": 4005152366,  //timestamp
	"ph": "I", //see: WebInspector.TracingModel.Phase
	"name": "TracingStartedInPage",
	"args":
		"data": {
			"sessionId": "762.9",
			"page": "0x7fe4a3e22020"
		}
	},
	"tts": 478070, //?
	"s": "g" //?
	//dur: defaults to 0 if not present
}"
```

Looking at TimelineModel._addEvent we can see some normalization of the fields in the rawEvent, which is then passed to Process._addEvent. A map of Processes are stored in this._processById[payload.pid]; indexed by pid (or created if the pid isn't present at the time that TimelineModel is invoked. Process._addEvent finds a Thread by thread id and then in turn calls _addEvent on that, passing the event again. So we're essentially seeing a mechanism by which event data is produced by the backend and then indexed in a tree of process + thread ids. In addition, async events seem to be indexed separately. _addEvent in the Thread uses a stack to keep track of object start + end events (synchronous only) calling _complete on an event that finishes which appears to aggregate the event .args for the ending events with the starting event.

And so our TracingModel is populated with events from the backend yay. So...but how does the view get rendered? And how does the backend generate these events?!?! And what about async events? SO MANY UNANSWERED QUESTIONS!?!?!?!

Well let's get to it - first how do things get rendered? Well, _onTracingComplete in our Timeline Model seems like a good candidate there.



