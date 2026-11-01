#---------------------------------------------------------------------------------------------------------------------
# Mimas GBA runtime, built with Butano (https://github.com/GValiente/butano).
# Run tools/export.py first: it writes graphics/ and include/mimas_map.h from the project.
#---------------------------------------------------------------------------------------------------------------------
TARGET      :=  mimas
BUILD       :=  build
LIBBUTANO   :=  ../butano/butano
PYTHON      :=  python3
SOURCES     :=  src
INCLUDES    :=  include ../butano/common/include
DATA        :=
GRAPHICS    :=  graphics ../butano/common/graphics
AUDIO       :=  audio
DMGAUDIO    :=  dmg_audio
ROMTITLE    :=  MIMAS
ROMCODE     :=  SMMS
USERFLAGS   :=
USERLIBDIRS :=
USERLIBS    :=
USERBUILD   :=
EXTTOOL     :=

ifndef LIBBUTANOABS
	export LIBBUTANOABS	:=	$(realpath $(LIBBUTANO))
endif

include $(LIBBUTANOABS)/butano.mak
