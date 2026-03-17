# Use the latest Node 24 LTS Alpine image for a small footprint
FROM node:24-alpine

# Set the working directory
WORKDIR /usr/src/app

# Copy package files first to leverage Docker layer caching
COPY package*.json ./

# Install production dependencies only
RUN npm install --only=production

# Copy the rest of your application code
COPY . .

# Set production environment and Cloud Run port
ENV NODE_ENV=production
ENV PORT=8080

# Expose port 8080 (Cloud Run's default)
EXPOSE 8080

# Run the application
CMD [ "node", "app.js" ]
