#!/bin/sh
# Sourced from /etc/profile.d/notice.sh (login shells) and /etc/bash.bashrc
# (non-login interactive shells) so it fires on every attach, however it
# happens. Guarded to interactive shells only so non-interactive sessions
# (e.g. Ansible) never see it mixed into their output.
#
# Debian's /etc/profile itself sources /etc/bash.bashrc for bash login
# shells, so this file's sourcing chain can be entered twice in one shell
# (once via /etc/profile.d, once via the direct /etc/bash.bashrc line).
# BTPI_NOTICE_SHOWN makes that harmless instead of printing the banner twice.
case "$-" in
  *i*)
    if [ -z "$BTPI_NOTICE_SHOWN" ]; then
      export BTPI_NOTICE_SHOWN=1
      cat <<'EOF'

################################################################
### NOTICE: This shell is running inside a container and    ###
###         NOT on a Raspberry Pi device.                    ###
################################################################

EOF
    fi
    ;;
esac
