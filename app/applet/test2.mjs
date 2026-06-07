const base64String = 'BIp8_3PyUjdon1oc1C9ZoO008oHzVkYWzVbPS2qKac4XNR8d1gdDMEwMqFxgfDBpSLxok3yyNQQ1DU3thMM-EFY';
const padding = '='.repeat((4 - base64String.length % 4) % 4);
const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
console.log(base64)
const rawData = atob(base64);
console.log(rawData.length);
