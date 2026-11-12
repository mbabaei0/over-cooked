// The phone controller's PeerJS, as a pinned npm package (version in
// assets/provenance.yaml); controller.html's script reads window.Peer.
import { Peer } from 'peerjs';

declare global {
  interface Window {
    Peer: typeof Peer;
  }
}

window.Peer = Peer;
