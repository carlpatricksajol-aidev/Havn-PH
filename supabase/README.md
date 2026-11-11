# Switching on ECStay accounts

Everything for landlord accounts is already built and tested in demo mode. To try it, open any page with `?demo=1`, for example `https://www.havnph.com/list?demo=1`. The demo covers sign-in, the listing editor, review, inquiries and the emails. To make it real, connect three services, then add two values to the site.

| Service | What it does | Cost to start |
|---|---|---|
| Supabase | Sign-in, database, listing photos | Free plan. Free projects pause after 7 days without visits, so move to Pro (US$25/month) once real landlords are using it |
| Resend | Sends the emails (sign-in code, welcome, listing updates, renter messages) | Free up to 3,000 emails a month (100 a day) |
| Google Cloud | "Continue with Google" | Free |

Use **your own** Supabase organisation for this, not the company's.

## 1. Create the Supabase project

1. At supabase.com, create a new organisation, then a new project named `ecstay` in the **Southeast Asia (Singapore)** region.
2. Open **SQL Editor**, paste the whole of `supabase/migrations/20261111000000_ecstay_core.sql`, and run it.
3. Open **Project Settings > API** and copy the **Project URL** and the **anon public** key. You'll need them in step 6.

## 2. Emails: Resend

1. At resend.com, create an account and add your domain, for example `mail.ecstay.ph` or `mail.havnph.com`. Then add the DNS records Resend shows you at your domain registrar, and wait until the domain shows as **Verified**.
2. Create an API key.
3. In Supabase, go to **Authentication > Emails > SMTP Settings** and turn on custom SMTP:
   - host `smtp.resend.com`, port `465`
   - user `resend`, password: the API key
   - sender: `hello@<your domain>`, name `ECStay`
4. Still under **Authentication**:
   - **Emails > Templates > Magic Link**: subject `Your ECStay code: {{ .Token }}`, body: everything in `emails/dist/supabase-otp.html`. Do the same for **Confirm signup**.
   - **Sign In / Providers > Email**: set **Email OTP Expiration** to `600` (10 minutes, which is what the email says) and **Email OTP Length** to `6`.
   - **URL Configuration**:
     - Site URL: `https://www.havnph.com`
     - Redirect URLs: add `https://www.havnph.com/signin` and `https://havnph.com/signin`

## 3. Continue with Google

1. Go to console.cloud.google.com, open **APIs & Services > OAuth consent screen**, and set up an external app named `ECStay`. Use your support email, and the links `https://www.havnph.com/privacy` and `https://www.havnph.com/terms`.
2. Go to **Credentials > Create credentials > OAuth client ID** and choose **Web application**. Add this as an **authorised redirect URI**: `https://<your project ref>.supabase.co/auth/v1/callback`.
3. In Supabase, go to **Authentication > Sign In / Providers > Google**, turn it on, and paste in the client ID and secret.

## 4. The email function (welcome, listing updates, renter messages, reminders)

Using the Supabase CLI (`npm i -g supabase`, then `supabase login`), run this from the repo folder:

```sh
supabase link --project-ref <your project ref>
supabase functions deploy notify --no-verify-jwt
supabase secrets set RESEND_API_KEY=<key> EMAIL_FROM="ECStay <hello@your-domain>" \
  TEAM_EMAIL=<inbox that gets sample-listing inquiries and contact messages> \
  NOTIFY_SECRET=<any long random text> SITE_URL=https://www.havnph.com
```

Then, in the SQL Editor (use the same NOTIFY_SECRET):

```sql
select vault.create_secret('https://<your project ref>.functions.supabase.co/notify', 'notify_url');
select vault.create_secret('<the same NOTIFY_SECRET>', 'notify_secret');
```

Draft reminders: turn on the `pg_cron` extension under **Database > Extensions**, then run:

```sql
select cron.schedule('ecstay-draft-reminders', '0 2 * * *', 'select public.remind_drafts()');  -- 10:00 Manila
```

The function reads the templates from `https://www.havnph.com/emails/dist/`, so to change an email, edit `emails/src` and run `node emails/build.mjs`, then deploy the site.

## 5. Make yourself the reviewer

Sign in once on the site, then run:

```sql
update public.profiles set role = 'admin' where email = '<your email>';
```

You'll see **Review listings** on your dashboard (`/host/review`). Every listing a landlord sends waits there until you **Approve and publish**, or **Ask for changes** with a note. Either way, the landlord gets an email.

## 6. Turn it on

In `assets/js/data.js`, set `supabaseUrl` and `supabaseAnonKey`, then deploy. The anon key is meant to be public; row-level security in the migration controls what each person can read and write.

Once it's on:
- **"List your place"** goes to sign-in, and from there to the listing editor.
- **"Contact Landlord"** on a room becomes the inquiry form (no more Messenger).
- **The contact page form** goes live.
- **Approved listings** show on the rooms list and map next to the samples.

## Check it works

1. Sign in with an email address you can read. The code arrives with the ECStay design and expires in 10 minutes.
2. The welcome email arrives, then add a listing with 5 photos and send it. The "We got your listing" email arrives (TEAM_EMAIL gets a copy).
3. As the admin, approve it at `/host/review`. You get the "is now live" email, and the listing appears on `/rooms`.
4. In a private window, open the listing and send an inquiry. The landlord gets "New inquiry", the renter gets a copy if they gave an email, and the message shows on the dashboard.
5. Send the contact form. TEAM_EMAIL receives it.
