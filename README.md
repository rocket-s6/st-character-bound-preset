# Character Bound Profile

SillyTavern extension that binds a [connection profile](https://docs.sillytavern.app/usage/core-concepts/connection-profiles/) to a character card. Selecting a character automatically switches to the connection profile bound to that character. This includes everything from API to the Model used to the Chat Completion Preset.

This works in group chats too, automatically switching between profiles whenever a character is about to speak in the group chat. This will be add a slight amount of latency on each switch because the /profile switch has an inbuilt delay.

## Install

Go to `SillyTavern/public/scripts/extensions/third-party/` and run 
`git clone https://github.com/rocket-s6/st-character-bound-preset`

OR

Open Extensions tab in SillyTavern, click Install Extension, and past this URL in the box: `https://github.com/rocket-s6/st-character-bound-preset`

## Usage

<img width="631" height="580" alt="image" src="https://github.com/user-attachments/assets/3da36ee6-c6fb-4ad9-bf76-e09cf6ccbffe" />


1. Open a character in the Character Management panel.
2. Use the **Bound profile** dropdown under **More...** to pick a connection profile, or leave it on **Bound profile** for none.
3. The binding is stored on the character card (`data.extensions.bound_connection_profile`) and is included when you export the card.

### When the profile switches

- **1:1 chats:** Opening a character that has a bound profile applies that profile. Characters with no binding leave the current connection profile unchanged.
- **Group chats:** Opening the group does not change the profile. When a member is drafted to speak, that member's bound profile is applied if one is set; otherwise the current profile is left as-is.

If the bound profile no longer exists on this SillyTavern instance, a warning is shown and the current connection is not changed. Recipients of an exported card need a connection profile with the same **name**.
