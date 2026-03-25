#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# PicPeak Droplet Bootstrap — 8digit Creative
# Run once on a fresh Ubuntu droplet. After this, deploy via GitHub Actions.
#
# Usage:
#   1. First run:   bash bootstrap-droplet.sh
#   2. Edit .env:   nano /opt/picpeak/.env
#   3. Continue:    bash /opt/picpeak/scripts/bootstrap-droplet.sh --continue
# =============================================================================

GITHUB_REPO="8digit/picpeak"
DOMAIN="gallery.8digitcreative.com"
APP_DIR="/opt/picpeak"
DEPLOY_USER="deploy"
ADMIN_EMAIL="franco@8digitcreative.com"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[PicPeak]${NC} $1"; }
warn() { echo -e "${YELLOW}[PicPeak]${NC} $1"; }

# ─── Phase 2: Continue after .env is configured ─────────────────────────────
if [[ "${1:-}" == "--continue" ]]; then
    log "Continuing setup..."

    cd "$APP_DIR"

    # Verify .env has been edited
    if grep -q "REPLACE_WITH" .env; then
        warn "ERROR: .env still contains REPLACE_WITH placeholders!"
        warn "Edit /opt/picpeak/.env first, then re-run with --continue"
        exit 1
    fi

    # Create required storage directories
    log "Creating storage directories..."
    mkdir -p storage/events/active storage/events/archived storage/thumbnails data logs
    chown -R 1001:1001 storage data logs

    # Configure Nginx virtual host
    log "Configuring Nginx..."
    cat > /etc/nginx/sites-available/$DOMAIN << 'NGINX_CONF'
server {
    listen 80;
    server_name gallery.8digitcreative.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name gallery.8digitcreative.com;

    ssl_certificate /etc/letsencrypt/live/gallery.8digitcreative.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gallery.8digitcreative.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    client_max_body_size 1G;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX_CONF

    ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default

    # Get SSL certificate (HTTP-only first, then enable HTTPS)
    log "Obtaining SSL certificate..."
    mkdir -p /var/www/certbot

    # Temporarily use HTTP-only config for certbot
    cat > /etc/nginx/sites-available/$DOMAIN << 'TEMP_CONF'
server {
    listen 80;
    server_name gallery.8digitcreative.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 200 'PicPeak setup in progress...';
        add_header Content-Type text/plain;
    }
}
TEMP_CONF

    nginx -t && systemctl reload nginx

    certbot certonly --webroot -w /var/www/certbot \
        -d $DOMAIN \
        --non-interactive --agree-tos \
        -m $ADMIN_EMAIL

    # Restore full HTTPS config
    cat > /etc/nginx/sites-available/$DOMAIN << 'NGINX_CONF'
server {
    listen 80;
    server_name gallery.8digitcreative.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name gallery.8digitcreative.com;

    ssl_certificate /etc/letsencrypt/live/gallery.8digitcreative.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gallery.8digitcreative.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    client_max_body_size 1G;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX_CONF

    nginx -t && systemctl reload nginx

    # Configure firewall
    log "Configuring firewall..."
    ufw allow 22/tcp
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw --force enable

    # Start the application
    log "Starting PicPeak..."
    docker compose -f docker-compose.production.yml pull
    docker compose -f docker-compose.production.yml up -d

    # Wait for services to start
    log "Waiting for services to initialize..."
    sleep 30
    docker compose -f docker-compose.production.yml ps

    # Show admin credentials
    log "============================================"
    log "PicPeak is live!"
    log "Site:  https://$DOMAIN"
    log "Admin: https://$DOMAIN/admin"
    log ""
    log "Admin credentials:"
    docker compose -f docker-compose.production.yml logs backend 2>&1 | grep -i "admin\|password\|credential" || true
    log ""
    log "Check .env for ADMIN_EMAIL and ADMIN_PASSWORD"
    log "============================================"

    exit 0
fi

# ─── Phase 1: Install dependencies and clone repo ───────────────────────────

log "Starting PicPeak droplet bootstrap..."
log "Droplet: $(hostname) / $(curl -sf http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address 2>/dev/null || echo 'unknown IP')"

# System updates
log "Updating system packages..."
apt-get update && apt-get upgrade -y

# Install Docker
if command -v docker &>/dev/null; then
    log "Docker already installed: $(docker --version)"
else
    log "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
fi

# Install Nginx and Certbot
log "Installing Nginx and Certbot..."
apt-get install -y nginx certbot python3-certbot-nginx git

# Create deploy user with Docker access
if id "$DEPLOY_USER" &>/dev/null; then
    log "Deploy user '$DEPLOY_USER' already exists"
else
    log "Creating deploy user '$DEPLOY_USER'..."
    adduser --disabled-password --gecos "" "$DEPLOY_USER"
    usermod -aG docker "$DEPLOY_USER"
fi

# Set up SSH for deploy user (for GitHub Actions)
log "Setting up SSH for deploy user..."
mkdir -p /home/$DEPLOY_USER/.ssh
chmod 700 /home/$DEPLOY_USER/.ssh

warn "============================================"
warn "IMPORTANT: Add the deploy SSH PUBLIC key:"
warn ""
warn "  nano /home/$DEPLOY_USER/.ssh/authorized_keys"
warn ""
warn "Paste the public key content, save, then run:"
warn "  chmod 600 /home/$DEPLOY_USER/.ssh/authorized_keys"
warn "  chown -R $DEPLOY_USER:$DEPLOY_USER /home/$DEPLOY_USER/.ssh"
warn "============================================"

# Clone the repo
if [ -d "$APP_DIR/.git" ]; then
    log "Repo already cloned at $APP_DIR"
else
    log "Cloning $GITHUB_REPO to $APP_DIR..."
    git clone "https://github.com/$GITHUB_REPO.git" "$APP_DIR"
fi

chown -R $DEPLOY_USER:$DEPLOY_USER "$APP_DIR"

log ""
log "============================================"
log "Phase 1 complete!"
log ""
log "Next steps:"
log "  1. Add deploy SSH public key to /home/$DEPLOY_USER/.ssh/authorized_keys"
log "  2. Edit the .env file:"
log "     nano $APP_DIR/.env"
log "     - Set SMTP_USER and SMTP_PASS (Gmail App Password)"
log "     - Verify all other settings"
log "  3. Run Phase 2:"
log "     bash $APP_DIR/scripts/bootstrap-droplet.sh --continue"
log "============================================"
