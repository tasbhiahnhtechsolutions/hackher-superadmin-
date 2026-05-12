UPDATE auth.users
SET 
  encrypted_password = crypt('12345678', gen_salt('bf')),
  email_confirmed_at = COALESCE(email_confirmed_at, now())
WHERE email = 'yasinturabi@gmail.com';