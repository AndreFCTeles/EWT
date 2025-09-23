/* |--- IMPORTS ---| */

// Frameworks0
import React, {
   useState,
   useEffect,
   useCallback
} from 'react';
import { 
   AppShell,
   //Button,
   //Stack,
   //Flex,
   Modal,
   Container,
   //Notification,
   Transition
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
//import { notifications } from '@mantine/notifications';
// Components
import LoginModal from '@/components/login/LoginModal';
//import Process from '@/Process';
// Utils
import login from '@/components/login/auth';
import { ChecklistController } from '@/components/checklist/ChecklistController';
import { Submission } from '@/components/checklist/types';
import { AdminHUD } from '@/components/admin/AdminHUD';
// Types
import { 
   Role,
   //mainComponents, 
   //processes,
   CredentialSafe,
   APP_NAME,
   LS_AUTH,
   LS_KEEP
} from '@/utils/types';



const initialSubmission: Submission = {
   header: { 
      operator: 'demo', 
      station: 'S1', 
      appVer: '0.1.0', 
      templateVer: '2025-09-19' 
   },
   dut: { 
      model: 'ELECTREX-600', 
      serial: 'SN-0001', 
      processes: ['MIG', 'TIG', 'MMA'] 
   },
   instruments: { 
      meterId: 'FLUKE-1', 
      meterCal: '2025-01-01', 
      lbId: 'LB-42' 
   },
   steps: [],
};







/* |--- COMPONENT ---| */
const App: React.FC  = () => {
   
   /* |--- STATES ---| */
   // Autenticação e níveis de acesso
   const [showLoginModal, setShowLoginModal] = useState(false); // ------------------------------ Mostra modal de login
   const [isLoggedIn, setIsLoggedIn] = useState(false); // -------------------------------------- Ativa/muda elementos UI após login
   const [authUser, setAuthUser] = useState<CredentialSafe | null>(null); // -------------------- Muda acesso a funcionalidades consoante autorização de login
   const [role, setRole] = useState<Role>('user');
// const roleRank: Record<Role, number> = { user: 0, admin: 1, superadmin: 2 }; // -------------- Nível de acesso
   const [authBooting, setAuthBooting] = useState(true); // ------------------------------------- Auto-login
   const [showChangePw, setShowChangePw] = useState(false); // ---------------------------------- Comportamento de modal de mudança de password
   const [persistLogin, setPersistLogin] =  // -------------------------------------------------- Mantém user ligado (skip login)
      useState<boolean>(() => {
         return localStorage.getItem(LS_KEEP) === '1';
      });
   // Sistema de Notificações
   const [notification, setNotification] = useState<{
      visible: boolean;
      title: string;
      message: string | React.ReactNode;
      color: string;
   }>({
      visible: false,
      title: '',
      message: '',
      color: 'green',
   });
   const showNotification = useCallback((title: string, message: string | React.ReactNode, color: string) => {
      setNotification({
         visible: true,
         title,
         message,
         color,
      });
      setTimeout(() => { setNotification((prevState) => ({ ...prevState, visible: false })); }, 5000);
   }, []);
   // Component management & nav
// const [currentComponent, setCurrentComponent] = useState<mainComponents | processes>('process');
// const [previousComponent, setPreviousComponent] = useState<mainComponents | processes>('process');
   const [submission, setSubmission] = useState<Submission>(initialSubmission);
   const [navOpened, { toggle: toggleNav }] = useDisclosure(role==='admin');

   // Content
   /*
   const renderComponent = () => {
      switch (currentComponent) {
         case 'process':
            return   <Process />;
         case 'login':
            return   <div>login form</div>;
         case 'wait':
            return   <div>awaiting input...</div>;
         default:
            return   <div>Em desenvolvimento</div>;
      }
   };
   */





   /* |--- HANDLERS ---| */

   // Login
   const handleLoginSuccess = (user: CredentialSafe) => {
      setAuthUser(user);
      setIsLoggedIn(true);
      setShowLoginModal(false);
   };
   const handleLoginClose = () => { setShowLoginModal(false); } // IMPORTANTE - Separei close de open por causa de bugs com a tecla Esc
   //const handlePersistToggle = useCallback((checked: boolean) => { setPersistLogin(checked); }, []); // passar computed canChangePassword 
   /*
   const handleLogout = useCallback(() => {
      setAuthUser(null);
      setIsLoggedIn(false);
      setPersistLogin(false);
      localStorage.removeItem(LS_KEEP);
      localStorage.removeItem(LS_AUTH);
      setShowChangePw(false);
   }, []);
   */




   /* |--- EFFECTS ---| */
   useEffect(() => { // Manter user logged in
      if (persistLogin) {
         localStorage.setItem(LS_KEEP, '1');
      } else {
         localStorage.removeItem(LS_KEEP);
         localStorage.removeItem(LS_AUTH); // dropping stale saved creds
      }
   }, [persistLogin]);
   // Auto-login
   useEffect(() => {
      ( async () => {
         try {
            const keep = localStorage.getItem(LS_KEEP) === '1';
            const raw = localStorage.getItem(LS_AUTH);
            if (keep && raw) {
               // try auto-login
               const { username, password, app } = JSON.parse(raw);
               const { user } = await login(username, password, app || APP_NAME);
               handleLoginSuccess(user);
            } else if (!keep) {
               localStorage.removeItem(LS_AUTH); // ensure no stale creds if flag is off
            }
         } catch {
            localStorage.removeItem(LS_AUTH); // saved creds invalid → drop them
         } finally { setAuthBooting(false); } // UI can render         
      } )();
   }, []);








   /* |--- JSX / RENDER APP ---| */
   return (
      <AppShell 
      layout="alt"
      transitionTimingFunction="ease"
      transitionDuration={500}
      header={{height: 48}}
      navbar={{ 
         width: navOpened ? 320 : 0, 
         breakpoint: 'sm',
         collapsed: {
            mobile: !navOpened, 
            desktop: !navOpened
         }
      }}
      bg={'blue.1'}
      >

         
         
         <Transition 
         mounted={navOpened} 
         transition={"scale-x"}
         duration={500}
         >
            {(transitionStyle) => (
               <AppShell.Navbar p={navOpened ? "sm" : 0} style={{ ...transitionStyle}} >
                  {/* navOpened && ( <AdminHUD submission={submission} />) */}
                  <AdminHUD submission={submission} importstyle={transitionStyle} />
               </AppShell.Navbar>
            )}
         </Transition>
         

         <AppShell.Header>     
            <Container size="lg" py={8}>
               {/* put a role toggle for dev */}
               <span 
               style={{ cursor: 'pointer' }} 
               onClick={() => {
                  setRole(r => r === 'user' ? 'admin' : 'user')
                  toggleNav();
               }}>
                  Role: <b>{role}</b>
               </span>
            </Container>    
         </AppShell.Header>


         <AppShell.Main>
            {/* renderComponent() */}
            <Container fluid py="md" mih={"100%"}>
               <ChecklistController
               role={role}
               submission={submission}
               setSubmission={setSubmission}
               // you can pass jumpTo for admin here later
               />
            </Container>
            
            {!authBooting && showLoginModal && (
               <Modal
               opened={showLoginModal}
               onClose={() => setShowLoginModal(false)}
               title=""
               centered
               withCloseButton={false}
               closeOnClickOutside={false}
               className='formModal'
               overlayProps={{ 
                  backgroundOpacity: 0.55, 
                  blur: 3 
               }}            
               style={{ 
                  left: "0%", 
                  position: "absolute" 
               }} >
                  <LoginModal 
                  onLoginSuccess={handleLoginSuccess} 
                  onClose={handleLoginClose}
                  />
               </Modal>
            )}
         </AppShell.Main>


      </AppShell>






   )
}

export default App

