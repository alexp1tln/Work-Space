import fs from "fs";
(async () => {
  try {
    const res = await fetch("http://localhost:3000/api/push/vapid-public-key");
    const json = await res.json();
    console.log(json);
  } catch (err) {
    console.error(err);
  }
})();
