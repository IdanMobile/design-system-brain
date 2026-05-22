import React from "react";
import {
  Alert,
  Avatar,
  Badge,
  Box,
  Breadcrumbs,
  Button,
  Card,
  CardActions,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Container,
  CssBaseline,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  Link,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  LinearProgress,
  MenuItem,
  Pagination,
  Paper,
  Rating,
  Select,
  Slider,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  ThemeProvider,
  Typography,
  createTheme
} from "@mui/material";

const theme = createTheme();

/** Page-scale MUI fixture — one wrapped deliverable matching Storybook / Figma. */
export function MUIShowcase() {
  const [tabValue, setTabValue] = React.useState(0);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box data-figma-component="MUIShowcase" sx={{ bgcolor: "#f7f8fb", minHeight: "100vh", py: 4 }}>
        <Container maxWidth="lg">
          <Stack spacing={3}>
            <Typography variant="h4">Material UI Showcase</Typography>
            <Typography color="text.secondary">
              This page renders common components directly from MUI.
            </Typography>

            <Paper elevation={1} sx={{ p: 3 }}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} useFlexGap sx={{ flexWrap: "wrap" }}>
                <Button variant="contained">Contained</Button>
                <Button variant="outlined">Outlined</Button>
                <Button variant="text">Text</Button>
                <Chip label="Default Chip" />
                <Chip color="success" label="Success Chip" />
                <Badge badgeContent={4} color="primary">
                  <Chip label="Notifications" />
                </Badge>
                <Avatar>MU</Avatar>
              </Stack>
            </Paper>

            <Paper elevation={1} sx={{ p: 3 }}>
              <Stack spacing={2}>
                <Typography variant="h6">Navigation</Typography>
                <Breadcrumbs aria-label="breadcrumb">
                  <Link underline="hover" color="inherit" href="#">
                    Home
                  </Link>
                  <Link underline="hover" color="inherit" href="#">
                    Components
                  </Link>
                  <Typography color="text.primary">MUI Showcase</Typography>
                </Breadcrumbs>
                <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
                  <Tabs value={tabValue} onChange={(_, value: number) => setTabValue(value)}>
                    <Tab label="Overview" />
                    <Tab label="Design" />
                    <Tab label="Usage" />
                  </Tabs>
                </Box>
                <Typography color="text.secondary" variant="body2">
                  {tabValue === 0 && "Overview tab content."}
                  {tabValue === 1 && "Design tab content."}
                  {tabValue === 2 && "Usage tab content."}
                </Typography>
              </Stack>
            </Paper>

            <Paper elevation={1} sx={{ p: 3 }}>
              <Stack spacing={2}>
                <Typography variant="h6">Form Controls</Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField label="Email" defaultValue="alex@example.com" size="small" />
                  <FormControl size="small" sx={{ minWidth: 180 }}>
                    <InputLabel id="role-select-label">Role</InputLabel>
                    <Select labelId="role-select-label" defaultValue="designer" label="Role">
                      <MenuItem value="designer">Designer</MenuItem>
                      <MenuItem value="developer">Developer</MenuItem>
                      <MenuItem value="product">Product Manager</MenuItem>
                    </Select>
                  </FormControl>
                </Stack>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <FormControlLabel control={<Checkbox defaultChecked />} label="Receive updates" />
                  <FormControlLabel control={<Switch defaultChecked />} label="Dark mode" />
                  <Rating defaultValue={4} precision={0.5} />
                </Stack>
                <Box sx={{ px: 1 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Satisfaction
                  </Typography>
                  <Slider defaultValue={70} valueLabelDisplay="auto" />
                </Box>
              </Stack>
            </Paper>

            <Box
              sx={{
                display: "grid",
                gap: 3,
                gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }
              }}
            >
              <Box>
                <Paper elevation={1} sx={{ p: 3, height: "100%" }}>
                  <Stack spacing={2}>
                    <Typography variant="h6">List</Typography>
                    <List>
                      <ListItem>
                        <ListItemAvatar>
                          <Avatar>A</Avatar>
                        </ListItemAvatar>
                        <ListItemText primary="Analytics" secondary="Charts and usage metrics" />
                      </ListItem>
                      <ListItem>
                        <ListItemAvatar>
                          <Avatar>D</Avatar>
                        </ListItemAvatar>
                        <ListItemText primary="Design System" secondary="Tokens and components" />
                      </ListItem>
                    </List>
                  </Stack>
                </Paper>
              </Box>
              <Box>
                <Paper elevation={1} sx={{ p: 3, height: "100%" }}>
                  <Stack spacing={2}>
                    <Typography variant="h6">Data Table</Typography>
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Component</TableCell>
                            <TableCell align="right">Usage</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          <TableRow>
                            <TableCell>Button</TableCell>
                            <TableCell align="right">1,240</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Card</TableCell>
                            <TableCell align="right">830</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Tabs</TableCell>
                            <TableCell align="right">560</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TableContainer>
                    <Pagination count={8} color="primary" shape="rounded" />
                  </Stack>
                </Paper>
              </Box>
            </Box>

            <Paper elevation={1} sx={{ p: 3 }}>
              <Stack spacing={1}>
                <Typography variant="h6">Alerts</Typography>
                <Alert severity="success">MUI dependencies are loaded and ready.</Alert>
                <Alert severity="warning">Check responsive behavior on small viewports.</Alert>
                <Alert severity="error">Use this state for error messaging previews.</Alert>
              </Stack>
            </Paper>

            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6">Status</Typography>
                <Typography color="text.secondary" sx={{ mb: 2 }}>
                  Component health and progress.
                </Typography>
                <Stack spacing={2}>
                  <Alert severity="info">Storybook is rendering MUI components successfully.</Alert>
                  <LinearProgress variant="determinate" value={68} />
                  <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
                    <CircularProgress size={22} />
                    <Typography variant="body2" color="text.secondary">
                      Syncing design tokens...
                    </Typography>
                  </Stack>
                </Stack>
              </CardContent>
              <Divider />
              <CardActions>
                <Button size="small">View Details</Button>
                <Button size="small" variant="contained">
                  Continue
                </Button>
              </CardActions>
            </Card>
          </Stack>
        </Container>
      </Box>
    </ThemeProvider>
  );
}
