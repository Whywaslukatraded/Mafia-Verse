export async function requestNotificationPermission() {
  if (!("Notification" in window)) return false;
  
  if (Notification.permission === "granted") return true;
  
  if (Notification.permission !== "denied") {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  }
  
  return false;
}

export function sendNotification(title: string, body: string) {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    console.log("Notification not sent: Permission not granted or not supported");
    return;
  }

  try {
    new Notification(title, {
      body,
      icon: "/favicon.ico", // Standard icon
    });
  } catch (e) {
    console.error("Failed to send notification:", e);
  }
}
