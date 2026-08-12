export function readGamepadInputCodes(gamepads, deadzone = 0.25) {
  const active = new Set();
  const threshold = Math.max(0, Math.min(0.95, Number(deadzone) || 0.25));
  for (const pad of Array.from(gamepads ?? [])) {
    if (!pad) continue;
    const buttons = Array.from(pad.buttons ?? []);
    const pressed = (index) => {
      const button = buttons[index];
      return Boolean(button && (button.pressed === true || Number(button.value ?? 0) >= 0.5));
    };
    for (let index = 0; index < buttons.length; index += 1) if (pressed(index)) active.add(`GamepadButton${index}`);
    if (pressed(12)) active.add("GamepadDPadUp");
    if (pressed(13)) active.add("GamepadDPadDown");
    if (pressed(14)) active.add("GamepadDPadLeft");
    if (pressed(15)) active.add("GamepadDPadRight");
    if (pressed(6)) active.add("GamepadLeftTrigger");
    if (pressed(7)) active.add("GamepadRightTrigger");

    const axes = Array.from(pad.axes ?? [], (value) => Number(value) || 0);
    if (axes[0] < -threshold) { active.add("GamepadAxis0Negative"); active.add("GamepadDPadLeft"); }
    if (axes[0] > threshold) { active.add("GamepadAxis0Positive"); active.add("GamepadDPadRight"); }
    if (axes[1] < -threshold) { active.add("GamepadAxis1Negative"); active.add("GamepadDPadUp"); }
    if (axes[1] > threshold) { active.add("GamepadAxis1Positive"); active.add("GamepadDPadDown"); }
  }
  return [...active].sort();
}
