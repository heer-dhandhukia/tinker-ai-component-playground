import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import { useState } from 'react';

export function SettingsDialog() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="contained" onClick={() => setOpen(true)}>
        Open settings
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogTitle>Settings</DialogTitle>
        <DialogContent>
          <DialogContentText>Notifications are sent once a day.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => setOpen(false)}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
