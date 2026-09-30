import { nextOauthSeguro } from "@/lib/utils/redireccionOauth";
for (const v of ["/oauth/consent?authorization_id=abc12345-6789","https://evil.com","//evil.com","/oauth/consent?authorization_id=abc12345&x=https://evil","/oauth/consent?authorization_id=%2F%2Fevil.com%2Fxx","/panel","/oauth/consent?authorization_id=%E0%A4%A"]) console.log(JSON.stringify(v), "=>", nextOauthSeguro(v));
