# YamaSend

Panel de WhatsApp Marketing para Yamas.AI. Migración de la versión HTML original a Next.js + Supabase, con autenticación real y Row Level Security.

## Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS v4
- Supabase (Auth + Postgres con RLS)

## Setup local

1. Instalar dependencias:
   ```
   npm install
   ```

2. Crear un archivo `.env.local` en la raíz con:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://fhqqdnehsjgnnqirsinu.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<la anon key del proyecto Supabase "Yamas.AI">
   ```

3. Correr en desarrollo:
   ```
   npm run dev
   ```

## Deploy

Pensado para desplegar en Vercel. Las mismas variables de entorno del paso 2 deben cargarse en Vercel → Settings → Environment Variables.
