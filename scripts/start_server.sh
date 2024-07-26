#!/bin/bash
# Navigate to the application directory
cd /var/www/resourceBucket

# Stop any running instances of the application
pm2 stop all

# Start the application
pm2 start app.js
