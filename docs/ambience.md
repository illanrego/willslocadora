# Store ambience

## Current implementation

Immersive mode has two independent, opt-in controls. Both are off by default and start only after the user presses a control, satisfying browser autoplay rules:

- **Store music** plays the authored music loop only.
- **Store ambience** plays the two room loops and occasional effects only.

Both layers can be enabled together. Leaving immersive mode stops both layers and resets their controls.

The immersive header is a compact one-strip control bar by default, with draft genre and year selectors applied together through **Go**. Its **Sound** drawer contains the music and ambience switches, music-tape selector, and separate channel-volume controls. Volume changes affect their channel immediately and do not change the other channel.

## Asset contract

Use MP3 for the first pack: 44.1 kHz and 128–160 kbps. Keep looping files seamless and 60–180 seconds long. Effects should be short one-shots.

```text
public/audio/
├── ambience/
│   ├── fluorescent-hum-loop.mp3
│   ├── store-room-tone.mp3
│   ├── fluorescent-light-flicker.mp3
│   ├── vhs-eject.mp3
│   └── shop-door-bell.mp3
└── music/
    ├── 1980s/
    ├── 1990s/
    ├── 2000s/
    ├── 2010s/
    └── 2020s/
        ├── night-drive.mp3
        ├── late-fee-dreams.mp3
        └── closing-time.mp3
```

The ambience folder is shared for every store year. Its two loops play continuously while ambience is enabled. The fluorescent-light effect is scheduled often (about every 12–28 seconds), the VHS eject is occasional (about every 35–80 seconds), and the door bell is rare (about every 110–220 seconds). All three effects belong only to the ambience toggle.

Music changes by selected decade and the user can choose a tape from the three named tracks. Use the same names in every decade folder; each decade gets its own composition. If an asset is absent, its control reports the missing shared ambience pack or selected decade instead of pretending audio is playing.

The music files are for the user-authored Suno tracks. Keep the downloaded source file and the applicable Suno usage-rights record outside the browser bundle.

## Rights policy

Do not bundle decade songs, broadcast-radio recordings, or station streams as store ambience without explicit rights for that exact use.

For future authored ambience assets:

1. Prefer CC0 audio.
2. CC-BY is acceptable only with preserved creator, title, source URL, license URL, and required attribution in an in-app credits panel and `docs/` manifest.
3. Do not use NC assets.
4. Do not use BY-SA assets unless the project intentionally complies with its share-alike requirements.
5. Treat Internet Archive material as rights-unknown until the individual item's metadata confirms its status.
6. A radio directory is discovery infrastructure, not a music licence. Do not proxy, cache, rebroadcast, or present indexed streams as Locadora-owned audio.

## Future direction

Keep the default ambience shared and cleared. If live radio is added later, make it a separate user-selected external source with station name, homepage, terms review, attribution, and a default-off toggle.
