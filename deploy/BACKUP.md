# Backup and Recovery

Admin dashboard → **Backup & Recovery** (administrators only). This page explains what is backed up, how full and differential backups relate, how they are encrypted, and how to restore.

## What a backup contains

| Included | Not included |
|---|---|
| Every table in the zoo database: animals, map places, buildings and walkways, map versions, QR codes, events, announcements, zoo updates, ticket prices and their history, FAQ, games, chat history, analytics, form submissions, settings | **Supabase Auth accounts** (logins and passwords are managed by Supabase; back them up from the Supabase dashboard if needed) |
| Every uploaded file in Supabase Storage (animal and gallery photos) | The **audit log**. It is never rolled back, so a restore can't erase the record of what happened. |
| | The backup catalogue itself, and the list of applied database migrations |
| | The source code, the bundled website photos and the **AI model files**. Back these up by copying the project folder. |

So a restore brings back all zoo data and uploaded photos. A complete disaster recovery also needs the project folder (code and AI model) and the Supabase project.

## Full and differential backups

- **Full backup**: every row of every table in scope and every uploaded file, at one moment.
- **Differential backup**: everything that changed **since the most recent full backup**. To make it, the server opens that full backup and compares each table row by row by primary key, using the exact row text. It stores:
  - new and changed rows (whole rows);
  - the keys of deleted rows;
  - new or changed files, compared by name, size and last-modified time;
  - the names of deleted files.

  Each differential records the id and SHA-256 fingerprint of its full backup.
- **Restoring** a full backup uses that file alone. Restoring a differential takes its full backup and applies the differential on top, so **both files are needed**. A differential never depends on another differential.

A good routine is a full backup once a week, differential backups daily or after important changes, and a new full backup after large imports.

## Encryption and keys

- Backups are compressed and then encrypted with **AES-256-GCM** (authenticated encryption), so changing even one byte makes the file impossible to open.
- The 256-bit key is derived from the **backup passphrase** with **scrypt** (N = 32768, r = 8, p = 1), with a new random salt for every file. The passphrase and key are **never stored or logged**. Only the administrator knows the passphrase.
- **Use the same passphrase for a full backup and its differentials**, because a differential has to open its full backup. Keep the passphrase in a safe place, separate from the backup files (for example, a password manager). **Without the passphrase, a backup can't be restored**: there is no recovery key.
- File layout: `MZB1` | header length | header (format, backup id, type, base backup and its SHA-256, scrypt settings, salt) | IV | GCM tag | ciphertext. The header is authenticated too.

## Where backups are stored

- Encrypted files (`*.mzb`) are saved in a private folder on the server, outside the website's files:
  - **On the laptop**: `backups/encrypted/` in the project folder.
  - **With Docker**: the `zoo_backups` volume (`BACKUP_DIR=/backups`).
- Files are created with owner-only permissions and are never overwritten. Each backup gets a new file name.
- The database keeps a catalogue: type, base backup, date, size, SHA-256, record counts, status, who made it, and errors.
- **Copy the backup files somewhere else regularly** (an external drive or cloud storage). Backups kept only on the same machine don't survive losing that machine.

## Making a backup

1. Open **Backup & Recovery** and wait for the loading screen.
2. Enter your **account password** to unlock backups for 15 minutes.
3. Choose **Full backup** or **Differential backup**, then enter the passphrase (twice for a full backup).
4. The progress bar shows each real step: reading tables, copying photos, encrypting, saving, and **verifying** that the saved file opens. "Backup complete" appears only after the check succeeds.

## Restoring

1. Unlock, choose **Recovery**, and pick the backup. Its integrity check (SHA-256 of the file and, for a differential, of its full backup) shows straight away.
2. Enter the passphrase, click **Restore…**, and type **RESTORE** to confirm.
3. The server then:
   1. checks both files and decrypts them; a wrong passphrase or a damaged file stops here, and **nothing changes**;
   2. makes a **safety full backup** of the current data (same passphrase);
   3. replaces all tables in scope **in one database transaction**, then compares every restored row with the backup before committing. Any difference rolls everything back;
   4. puts back any uploaded photos that are missing or different. Photos added after the backup are left in place.
4. Every step is recorded in the audit log (`backup.unlock`, `backup.full`, `backup.differential`, `backup.verify`, `backup.restore`, with success or failure).

To undo a restore, restore the safety backup it created (the number is shown when the restore finishes).

## What was tested

The acceptance test (October 21, 2026) ran a complete cycle against the live database:

1. A full backup.
2. A known change, then a differential backup. It contained only the changed rows, and its file contained no readable text.
3. Integrity checks passed.
4. Further changes, then a restore of the differential:
   - a wrong passphrase was refused before anything changed;
   - a safety backup was made;
   - the data returned exactly to the differential's state;
   - rows created afterwards were gone;
   - the 33 animals were intact;
   - the audit log was kept, and it recorded the restore.
