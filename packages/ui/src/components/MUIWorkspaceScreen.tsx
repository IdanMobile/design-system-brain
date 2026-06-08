import React from "react";
import {
  Alert,
  AppBar,
  Avatar,
  Badge,
  Box,
  BottomNavigation,
  BottomNavigationAction,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  CssBaseline,
  Divider,
  Fab,
  IconButton,
  LinearProgress,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Stack,
  SvgIcon,
  TextField,
  ThemeProvider,
  Toolbar,
  Typography,
  createTheme
} from "@mui/material";

const theme = createTheme({
  palette: {
    primary: { main: "#5c6bc0" },
    secondary: { main: "#ff7043" },
    background: { default: "#f3f4f8" }
  },
  shape: { borderRadius: 12 }
});

const projects = [
  {
    name: "Design System v3",
    lead: "Maya Chen",
    progress: 72,
    status: "On track",
    color: "success" as const,
    tasks: 14
  },
  {
    name: "Figma Import Pipeline",
    lead: "Alex Rivera",
    progress: 45,
    status: "Review",
    color: "warning" as const,
    tasks: 8
  },
  {
    name: "Mobile Checkout",
    lead: "Sam Okonkwo",
    progress: 91,
    status: "Ship soon",
    color: "primary" as const,
    tasks: 3
  }
];

const activity = [
  { title: "Pixel diff cleared", detail: "LoginPage • 0.02%", time: "2m" },
  { title: "New story extracted", detail: "MeetingHomePage", time: "18m" },
  { title: "Plugin rebuild", detail: "code-v2.ts updated", time: "1h" }
];

function SearchIcon() {
  return (
    <SvgIcon fontSize="small">
      <path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
    </SvgIcon>
  );
}

function HomeNavIcon() {
  return (
    <SvgIcon>
      <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
    </SvgIcon>
  );
}

function FolderNavIcon() {
  return (
    <SvgIcon>
      <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
    </SvgIcon>
  );
}

function BellNavIcon() {
  return (
    <SvgIcon>
      <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
    </SvgIcon>
  );
}

function PersonNavIcon() {
  return (
    <SvgIcon>
      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
    </SvgIcon>
  );
}

function AddIcon() {
  return (
    <SvgIcon>
      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
    </SvgIcon>
  );
}

export function MUIWorkspaceScreen() {
  const [nav, setNav] = React.useState(0);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        data-figma-component="MUIWorkspaceScreen"
        sx={{
          width: 390,
          minHeight: 844,
          mx: "auto",
          bgcolor: "background.default",
          borderRadius: "24px",
          overflow: "hidden",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 12px 40px rgba(15, 23, 42, 0.12)"
        }}
      >
        <AppBar position="static" elevation={0} color="inherit" sx={{ bgcolor: "#fff" }}>
          <Toolbar sx={{ gap: 1, minHeight: 56 }}>
            <Avatar sx={{ width: 36, height: 36, bgcolor: "primary.main", fontSize: 14 }}>LW</Avatar>
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ lineHeight: 1.2 }}>
                Good morning
              </Typography>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                Lab Workspace
              </Typography>
            </Box>
            <IconButton size="small" aria-label="Notifications">
              <Badge badgeContent={3} color="secondary">
                <BellNavIcon />
              </Badge>
            </IconButton>
          </Toolbar>
        </AppBar>

        <Box sx={{ flex: 1, overflow: "auto", pb: 10, px: 2, pt: 1.5 }}>
          <Stack spacing={2}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search projects, stories..."
              slotProps={{
                input: {
                  startAdornment: (
                    <Box sx={{ display: "flex", pl: 0.5, pr: 1, color: "text.secondary" }}>
                      <SearchIcon />
                    </Box>
                  )
                }
              }}
              sx={{ bgcolor: "#fff" }}
            />

            <Alert severity="info" variant="outlined" sx={{ py: 0.5 }}>
              4 stories ready for Figma live test
            </Alert>

            <Stack direction="row" spacing={1} sx={{ overflowX: "auto", pb: 0.5 }}>
              {["All", "Active", "Review", "Shipped"].map((label, i) => (
                <Chip key={label} label={label} color={i === 0 ? "primary" : "default"} size="small" />
              ))}
            </Stack>

            <Box>
              <Stack direction="row" sx={{ mb: 1, justifyContent: "space-between", alignItems: "center" }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Active Projects
                </Typography>
                <Button size="small">View all</Button>
              </Stack>

              <Stack spacing={1.5}>
                {projects.map((project) => (
                  <Card key={project.name} variant="outlined" sx={{ bgcolor: "#fff" }}>
                    <CardContent sx={{ pb: 1 }}>
                      <Stack
                        direction="row"
                        sx={{ mb: 1, justifyContent: "space-between", alignItems: "flex-start" }}
                      >
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                          {project.name}
                        </Typography>
                        <Chip label={project.status} color={project.color} size="small" />
                      </Stack>
                      <Stack direction="row" spacing={1} sx={{ mb: 1.5, alignItems: "center" }}>
                        <Avatar sx={{ width: 24, height: 24, fontSize: 11 }}>{project.lead[0]}</Avatar>
                        <Typography variant="caption" color="text.secondary">
                          {project.lead} • {project.tasks} tasks open
                        </Typography>
                      </Stack>
                      <LinearProgress variant="determinate" value={project.progress} sx={{ height: 6, borderRadius: 99 }} />
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                        {project.progress}% complete
                      </Typography>
                    </CardContent>
                    <Divider />
                    <CardActions sx={{ py: 0.5 }}>
                      <Button size="small">Details</Button>
                      <Button size="small" variant="contained">
                        Open
                      </Button>
                    </CardActions>
                  </Card>
                ))}
              </Stack>
            </Box>

            <Box>
              <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 700 }}>
                Recent Activity
              </Typography>
              <Card variant="outlined" sx={{ bgcolor: "#fff" }}>
                <List dense disablePadding>
                  {activity.map((item, index) => (
                    <React.Fragment key={item.title}>
                      <ListItem alignItems="flex-start">
                        <ListItemAvatar>
                          <Avatar sx={{ width: 32, height: 32, bgcolor: "primary.light", color: "primary.dark", fontSize: 12 }}>
                            {item.time}
                          </Avatar>
                        </ListItemAvatar>
                        <ListItemText
                          primary={item.title}
                          secondary={item.detail}
                          slotProps={{
                            primary: { variant: "body2", sx: { fontWeight: 600 } },
                            secondary: { variant: "caption" }
                          }}
                        />
                      </ListItem>
                      {index < activity.length - 1 ? <Divider component="li" /> : null}
                    </React.Fragment>
                  ))}
                </List>
              </Card>
            </Box>
          </Stack>
        </Box>

        <Fab
          color="secondary"
          size="medium"
          aria-label="Add project"
          sx={{ position: "absolute", right: 16, bottom: 72 }}
        >
          <AddIcon />
        </Fab>

        <BottomNavigation
          showLabels
          value={nav}
          onChange={(_, value: number) => setNav(value)}
          sx={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            borderTop: 1,
            borderColor: "divider",
            bgcolor: "#fff"
          }}
        >
          <BottomNavigationAction label="Home" icon={<HomeNavIcon />} />
          <BottomNavigationAction label="Projects" icon={<FolderNavIcon />} />
          <BottomNavigationAction label="Alerts" icon={<BellNavIcon />} />
          <BottomNavigationAction label="Profile" icon={<PersonNavIcon />} />
        </BottomNavigation>
      </Box>
    </ThemeProvider>
  );
}
