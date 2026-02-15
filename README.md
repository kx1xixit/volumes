# Introduction to Volumes (beta)

Volumes is a power user-oriented virtual file system extension for Scratch. It has power-user features like trash, disposable RAM folder (clears on project start), FS persistence, and more.

## Who is this for?

Volumes is for users who wish to create an operating system in Scratch and who want to add a file system to it. Volumes provides an easy-to-use solution for this, in opposition to rxFS which is jankily built.

## Key features

- **Disposable RAMdisk**: The `/RAM/` folder can be used for temporary files and directories, and it is automatically cleared when the project starts or stops.
- **Trash**: Deleted files go to the `/.Trash/` directory, waiting until they are deleted from there as well.
- **FS persistence**: You can sync the entirety of your virtual file system to a LocalStorage or IndexedDB entry for use on other sessions.

## Why choose Volumes (beta)?

Volumes aims to improve upon existing solutions (like rxFS) by focusing on stability, performance, and a comprehensive feature set. It introduces "killer features" like the RAMdisk and native persistence handling to make OS development smoother.

## I'm sold, how do I install it?

Installing Volumes to your TurboWarp project is easy:

1. Open [TurboWarp](https://turbowarp.org/editor)
2. Click the 'Add extension' button (the puzzle piece and the plus icon)
3. Search for 'Custom Extension' and click on its result
4. Click 'Files' and 'No files selected'
5. When your file explorer of choice opens, find the downloaded file and double-click it