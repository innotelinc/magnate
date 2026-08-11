// Official Jellyfin app store download URLs (verified against jellyfin.org/downloads
// and the jellyfin GitHub repos). Shared by the footer links and the homepage
// apps section.
export const APP_STORE_URLS = {
  // Jellyfin for iOS (iPhone & iPad)
  ios: "https://apps.apple.com/us/app/jellyfin-mobile/id1480192618",
  // Jellyfin for Android (phones & tablets)
  android: "https://play.google.com/store/apps/details?id=org.jellyfin.mobile",
  // Swiftfin — the Jellyfin client for Apple TV (tvOS)
  appleTv: "https://apps.apple.com/us/app/swiftfin/id1604098728",
  // Jellyfin for Android TV (Android TV, Google TV, Nvidia Shield, Fire TV)
  androidTv: "https://play.google.com/store/apps/details?id=org.jellyfin.androidtv",
} as const;
