import json
import re
import signal
import sys
import textwrap
from threading import Event
from time import monotonic

from speechd import CallbackType, SSIPClient


def speak(client, text, voice):
    if voice:
        if voice.get("lang"):
            client.set_language(voice["lang"])
        client.set_synthesis_voice(voice["name"])

    done = Event()
    stopping = False
    canceled = False

    def stop(*_):
        nonlocal stopping
        stopping = True

    def finished(event, **_):
        nonlocal canceled
        canceled = event == CallbackType.CANCEL
        done.set()

    signal.signal(signal.SIGTERM, stop)
    try:
        for paragraph in re.split(r"\n\s*\n", text.strip()):
            for passage in textwrap.wrap(paragraph, width=1000):
                done.clear()
                if stopping:
                    return
                client.speak(passage, finished, (CallbackType.END, CallbackType.CANCEL))
                deadline = monotonic() + 120
                while not stopping and not done.wait(0.1):
                    if monotonic() >= deadline:
                        client.cancel()
                        raise TimeoutError("Speech Dispatcher did not finish the passage")
                if stopping or canceled:
                    return
    finally:
        if stopping:
            client.cancel()


request = json.load(sys.stdin)
client = SSIPClient("bookvibe")
try:
    if request["action"] == "voices":
        voices = [
            {"name": name, "lang": lang or ""}
            for name, lang, _ in client.list_synthesis_voices()
        ]
        json.dump({"voices": voices}, sys.stdout)
    else:
        speak(client, request["text"], request.get("voice"))
        print("{}")
finally:
    client.close()
