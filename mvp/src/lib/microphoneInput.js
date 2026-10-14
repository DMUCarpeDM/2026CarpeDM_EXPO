// Keep exhibition capture identical to the working microphone diagnostic page.
export const RAW_MIC_SETTINGS = { autoGainControl: false, noiseSuppression: false, echoCancellation: false };

export function preferredUsbMicrophone(devices) {
  const inputs = devices.filter(device => device.kind === "audioinput" && device.deviceId && !["default", "communications"].includes(device.deviceId));
  return inputs.find(device => /USBAudio\s*1\.0/i.test(device.label) && /3634:4155/i.test(device.label))
    || inputs.find(device => /USBAudio\s*1\.0/i.test(device.label));
}

export function microphoneConstraints(preferred, savedId) {
  return { ...RAW_MIC_SETTINGS, ...(preferred ? { deviceId: { exact: preferred.deviceId } } : savedId ? { deviceId: { ideal: savedId } } : {}) };
}
