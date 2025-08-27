# Workaround for Webflow's 50000 character limit

## Using GitHub + jsDelivr

1. Create a repository.
2. Create your head.html and footer.html files, minify them and upload them to the repository.
3. Create a jsDelivr URL to serve it. The general format is: https://cdn.jsdelivr.net/gh/sworup-nekoi/nekoi-webflow-site-script@v1.0/head.html or footer.html
4. Go to wenflow and paste the jsdeliver link for head CSS as: <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/sworup-nekoi/nekoi-webflow-site-scripts@v1.0/folder-name/file-name.css" />
5. Go to wenflow and paste the jsdeliver link for footer JS as: <script src="https://cdn.jsdelivr.net/gh/sworup-nekoi/nekoi-webflow-site-scripts@v1.0/folder-name/file-name.js"></script>

### You can choose to upload each individual blocks or the entire code. 