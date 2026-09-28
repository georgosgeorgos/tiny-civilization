import markup from "./civilization.html?raw";

// The app queries its markup at import time, so insert the markup first.
document.body.innerHTML = markup;
void import("./civilization-app");
