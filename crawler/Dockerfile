FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app

# Copy package trước để cache
COPY package*.json ./

RUN npm install

# Copy toàn bộ code
COPY . .

# đảm bảo Playwright có browser
RUN npx playwright install --with-deps

# tránh crash permission
ENV NODE_ENV=production
COPY fb-session.json .
CMD ["node", "facebook_scrape.js"]