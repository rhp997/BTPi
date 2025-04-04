<a name="readme-top" id="readme-top"></a>

# Raspberry Pi Configuration

## Prerequisites

- A Raspberry Pi (RPi) with a working OS and GUI. Examples will assume Raspberry Pi OS (bookworm).
- Access to the RPi's command line with administrator/sudo privileges

## Basic RPi Config

1. Update Locale, Timezone, and Keyboard to match your environment. The scheduler and logs will utilize these values. Note the RPi defaults are UK-based. (Preferences --> Raspberry Pi Configuration --> Localisation)
2. Configure chromium not to ask about restoring the last session if improperly closed. Enter the following in a terminal:

   ```sh
   sed -i 's/"exited_cleanly":false/"exited_cleanly":true/' "$HOME/.config/chromium/Default/Preferences"
   sed -i 's/"exit_type":"Crashed"/"exit_type":"Normal"/' "$HOME/.config/chromium/Default/Preferences"
   ```

3. _Optional_: Enable SSH and VNC (Preferences --> Interfaces) and configure remote access. See VNC Notes below.
4. _Optional_: Disable notice for launching executable (e.g., \*.desktop) files

   - Open a file manager window and navigate to Edit --> Preferences --> General
   - Check box "Don't ask options on launch executable file"

   ### VNC Configuration Notes

   Note: Recent versions of Raspberry OS uses Wayland VNC (wayvnc) by default. Encryption is not fully implemented and unnecessarily takes up resources on a local network. If not needed or a "No matching security types" connection error is encountered, disable with:

   ```sh
   sudo nano /etc/wayvnc/config
   ```

   Set:
   enable_auth=false

   Reboot (wayvncctl doesn't seem to work?)

   **Hint:** to exit chromium's kiosk mode, you may need to access your viewer's menu by pressing F8, selecting "Alt", then hitting the F4 key to close. Unselect the "Alt" checkbox when finished.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Node.js Environment

Configure RPi to run Node.js by installing through nvm (avoid the repository version from apt). In a terminal:

```sh
sudo apt update && curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
```

Reload the terminal shell and check version to verify install:

```sh
source ~/.bashrc
nvm --version
```

List the versions available and find a Long-Term-Support (LTS) version to install:

```sh
nvm ls-remote
```

Install the chosen version by copying or typing in the version number. I chose the latest LTS version v22.13.1. Your options may vary:

```sh
nvm install v22.13.1
```

Set to use this version:

```sh
nvm use v22.13.1
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Install BTPi

Create the server path, temporarily open permissions to facilitate module installation and repo copy, clone the BTPi repository, and install the required modules:

```sh
sudo mkdir /srv/BTPi && sudo chmod 777 /srv/BTPi
git clone https://github.com/rhp997/BTPi.git /srv/BTPi
```

Download the required modules inside the /srv/BTPi directory:

```sh
cd /srv/BTPi
npm init -y
npm install express mssql winston winston-daily-rotate-file winston moment-timezone node-schedule cors axios xml2js
```

_Optional:_ Install pm2 (globally) to manage the process:

```sh
npm install pm2@latest -g
```

## Configure Server

Modify the configuration files for your environment. See the <a href="README.md#server-config">configuration section</a> in the README for details.

Once configured, open a terminal and navigate to the /srv/BTPi directory
Test the server by running:

```sh
node app.js
```

If everything worked, you should see a message stating the server has started and is listening on the configured port. Additionally, if queries were specified in queries.json, they will attempt to run on server initialization and the resultant /public/data/\*.json files should be created. The log files should help to troubleshoot any issues.

To view the web default BTPi web page, open a browser and navigate to `http://localhost:<port`> (where port is the configured port; 3000 by default).

### Cleanup

Finally, once you are satisfied the server is running smoothly, change permissions on the folder back to the defaults:

```sh
sudo chmod 755 /srv/BTPi
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Autostart Browser

To start the browser in kiosk mode on reboot, locate the <a name="elsewhere" id="elsewhere"></a>rpi-config/BTPI.desktop file and edit with a text editor to use the configured port. Save the .desktop file and copy it to the autostart directory:

```sh
mkdir -p ~/.config/autostart
cp /srv/BTPi/rpi-config/BTPi.desktop ~/.config/autostart && sudo chmod +x ~/.config/autostart/BTPi.desktop
```

_Optional:_ Copy the launcher to the Desktop:

```sh
cp /srv/BTPi/rpi-config/BTPi.desktop ~/Desktop && sudo chmod +x ~/Desktop/BTPi.desktop
```

Note the BTPi.desktop file intended for the autostart directory includes a sleep command to wait a few seconds before launching. This gives the RPi time to start the network and PM2 process. If copying to ~/Desktop, the sleep delay can be removed from the ~/Desktop copy.

Double click the launcher to test.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Optional: Daemonize the Server (PM2)

PM2 is a daemon process manager that keeps the application running and automatically started following a reboot.
With the server (node app.js) running in the background, change to the server directory and run the following:

```sh
cd /srv/BTPi
pm2 startup
```

Copy the text created by the startup command and run it in a terminal by pasting. Verify the command completed succesfully. Next, save the process list for reboot persistence:

```sh
pm2 save
```

Test by rebooting (sudo reboot) and checking for the running process with:

```sh
ps -ax | grep app.js
```

### PM2 Notes

View running processes:

```sh
pm2 ls
```

View information on app.js:

```sh
pm2 show app
```

Stop the process:

```sh
pm2 stop app
```

Start the process:

```sh
pm2 start app
```

Restart the process (kills the old process, starts a new one):

```sh
pm2 restart app
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Known Issues

//TODO: Remove?

When the app is daemonized using PM2, the process runs before the RPi network is up. When this happens, the error log will contain something like:

`"code": "ESOCKET",
"level": "error",
"message": "runQueries: Failed to connect to <DATABASE>:<PORT> - Could not connect (sequence)",
"name": "ConnectionError",
"originalError": {
"code": "ESOCKET"
}`

Depending on how often the schedule is configured to run, this could leave your webpage without data for some time. As a workaround, open a terminal after the network is up and restart the process:

```sh
pm2 restart app
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>
