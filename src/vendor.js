// The one-shot's two vendor scripts, now pinned npm packages (versions in
// assets/provenance.yaml). The game reads them as globals, as it did from the
// <script> tags, so they are set here before main.js runs.
import { Peer } from 'peerjs';
import qrcode from 'qrcode-generator';

window.Peer = Peer;
window.qrcode = qrcode;
