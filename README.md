# Character Bound Profile

SillyTavern extension that binds a [connection profile](https://docs.sillytavern.app/usage/core-concepts/connection-profiles/) to a character card.

## Install

Copy this folder to `public/scripts/extensions/third-party/st-character-bound-preset/` (Install for all users) or install it as a third-party extension. Requires the built-in **Connection Profiles** extension to be enabled.

## Usage

1. Open a character in the Character Management panel.
2. Use the **Bound profile** dropdown under **More...** to pick a connection profile, or leave it on **Bound profile** for none.
3. The binding is stored on the character card (`data.extensions.bound_connection_profile`) and is included when you export the card.

### When the profile switches

- **1:1 chats:** Opening a character that has a bound profile applies that profile. Characters with no binding leave the current connection profile unchanged.
- **Group chats:** Opening the group does not change the profile. When a member is drafted to speak, that member's bound profile is applied if one is set; otherwise the current profile is left as-is.

If the bound profile no longer exists on this SillyTavern instance, a warning is shown and the current connection is not changed. Recipients of an exported card need a connection profile with the same **name**.
