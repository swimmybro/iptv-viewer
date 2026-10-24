# Step 1: Use Nginx to serve the app
FROM nginx:alpine

# Step 2: Copy the built Angular files from your 'dist' folder
# NOTE: Replace 'your-app-name' with the actual folder name inside /dist/
COPY ./dist/your-app-name /usr/share/nginx/html

# Step 3: Expose port 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]