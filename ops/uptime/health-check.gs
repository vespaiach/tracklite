// Google Apps Script for the external uptime check (OPS-005). Paste into a new project at
// script.google.com, set healthUrl, then run installTrigger once. checkHealth then runs every
// 5 minutes and emails the script's owner when /health fails twice in a row.

const healthUrl = "https://tracklite.example.com/health";
const failuresBeforeAlert = 2;

function checkHealth() {
  const properties = PropertiesService.getScriptProperties();
  const failures = isHealthy() ? 0 : Number(properties.getProperty("failures") ?? 0) + 1;
  properties.setProperty("failures", String(failures));
  if (failures === failuresBeforeAlert) {
    MailApp.sendEmail(
      Session.getEffectiveUser().getEmail(),
      "Tracklite is down",
      `${healthUrl} has failed ${failures} checks in a row (5 minutes apart).`,
    );
  }
}

function isHealthy() {
  try {
    return UrlFetchApp.fetch(healthUrl, { muteHttpExceptions: true, followRedirects: false }).getResponseCode() === 200;
  } catch {
    return false;
  }
}

function installTrigger() {
  for (const trigger of ScriptApp.getProjectTriggers()) ScriptApp.deleteTrigger(trigger);
  ScriptApp.newTrigger("checkHealth").timeBased().everyMinutes(5).create();
}