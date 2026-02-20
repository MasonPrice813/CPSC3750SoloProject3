# Deployment Information

## Domain
- Domain Name: https://mason-price.com  
- Registrar: Cloudflare  

## Hosting Provider
- Platform: Render  
- Service Type: Web Service (Flask + Gunicorn)  

## Tech Stack
- Python 3.11  
- Flask  
- Gunicorn  
- SQLAlchemy  
- PostgreSQL  
- HTML, CSS, JavaScript  

## Database
- Type: PostgreSQL  
- Hosted On: Render Managed PostgreSQL  

## Deployment & Updates
- Code is pushed to GitHub.
- Render automatically builds and deploys the app.
- Build command (Render automatically does this): `pip install -r requirements.txt`
- Start command (Render automatically does this): `gunicorn app:app`

## Configuration & Secrets
- Sensitive values are not stored in the Github repository.
- The database connection string is stored in Render as an environment variable:
  - `DATABASE_URL`
