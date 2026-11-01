#---------------------------------------------------------------------------------------------------------------------
# Mimas GBA runtime, built with Butano (https://github.com/GValiente/butano).
# Run tools/export.py first: it writes graphics/ and include/mimas_map.h from the project.
#---------------------------------------------------------------------------------------------------------------------
TARGET      	:=  mimas
BUILD       	:=  build
LIBBUTANO   	:=  ../butano/butano
PYTHON      	:=  python3
SOURCES     	:=  src
INCLUDES    	:=  include ../butano/common/include
DATA        	:=
GRAPHICS    	:=  graphics ../butano/common/graphics
AUDIO       	:=  audio
AUDIOBACKEND	:=  maxmod
AUDIOTOOL		:=
DMGAUDIO    	:=  dmg_audio
DMGAUDIOBACKEND	:=  default
ROMTITLE    	:=  MIMAS
ROMCODE     	:=  SMMS
USERFLAGS   	:=
USERCXXFLAGS	:=
USERASFLAGS 	:=
USERLDFLAGS 	:=
USERLIBDIRS 	:=
USERLIBS    	:=
DEFAULTLIBS 	:=
STACKTRACE		:=
USERBUILD   	:=
EXTTOOL     	:=

ifndef LIBBUTANOABS
	export LIBBUTANOABS	:=	$(realpath $(LIBBUTANO))
endif

include $(LIBBUTANOABS)/butano.mak
