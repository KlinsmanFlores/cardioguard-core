export const parseHealthMetrics = (bytes) => {
  if (bytes.length === 17 && bytes[2] === 14) {
    const val = bytes[16];
    if (val >= 90 && val <= 100) return { type: 'SPO2', value: val };
    else if (val >= 40 && val <= 130) return { type: 'BPM', value: val };
  }
  return null;
};
